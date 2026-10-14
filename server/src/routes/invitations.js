import { Router } from "express";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { sendInvitationEmail } from "../lib/mailer.js";

const router = Router();

const INVITE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas
const ALLOWED_DOMAIN = "@sig.systems";

export function hashInviteToken(token) {
    return crypto.createHash("sha256").update(String(token)).digest("hex");
}

/** Busca una invitación válida (no usada y no expirada) a partir del token en claro. */
export async function findValidInvitation(token, client = prisma) {
    if (!token || typeof token !== "string" || token.length > 200) return null;
    return client.invitation.findFirst({
        where: {
            tokenHash: hashInviteToken(token),
            usedAt: null,
            expiresAt: { gt: new Date() },
        },
    });
}

const inviteLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: { message: "Demasiadas invitaciones en poco tiempo, espera unos minutos" },
    standardHeaders: true,
    legacyHeaders: false,
});

const verifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: { message: "Demasiados intentos, espera 15 minutos" },
    standardHeaders: true,
    legacyHeaders: false,
});

// GET /api/invitations/verify?token=... — público: valida el enlace antes de mostrar el formulario
router.get("/verify", verifyLimiter, async (req, res) => {
    try {
        const invitation = await findValidInvitation(req.query.token);
        if (!invitation) {
            return res.status(404).json({ message: "Esta invitación no es válida o ya expiró. Pide una nueva a tu supervisor." });
        }
        res.json({ email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error del servidor" });
    }
});

// GET /api/invitations — invitaciones pendientes (admin ve todas, lead solo las de operadores)
router.get("/", requireAuth, requireRole("admin", "lead"), async (req, res) => {
    try {
        const invitations = await prisma.invitation.findMany({
            where: {
                usedAt: null,
                expiresAt: { gt: new Date() },
                ...(req.user.role === "lead" && { role: "operator" }),
            },
            select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
            orderBy: { createdAt: "desc" },
        });
        res.json(invitations);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al obtener invitaciones" });
    }
});

// POST /api/invitations — crear y enviar invitación
router.post("/", requireAuth, requireRole("admin", "lead"), inviteLimiter, async (req, res) => {
    const email = String(req.body?.email ?? "").toLowerCase().trim();
    const role = req.body?.role === "lead" ? "lead" : "operator";

    if (!email) return res.status(400).json({ message: "El correo es requerido" });
    if (!/^[^\s@]+@[^\s@]+$/.test(email) || !email.endsWith(ALLOWED_DOMAIN)) {
        return res.status(400).json({ message: "Solo puedes invitar correos corporativos" });
    }
    if (role === "lead" && req.user.role !== "admin") {
        return res.status(403).json({ message: "Solo un administrador puede invitar leads" });
    }

    try {
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(409).json({ message: "Ya existe una cuenta con ese correo" });
        }

        // Una sola invitación activa por correo: las anteriores sin usar se reemplazan
        await prisma.invitation.deleteMany({ where: { email, usedAt: null } });

        const token = crypto.randomBytes(32).toString("base64url");
        const invitation = await prisma.invitation.create({
            data: {
                email,
                role,
                tokenHash: hashInviteToken(token),
                invitedById: req.user.id,
                expiresAt: new Date(Date.now() + INVITE_TTL_MS),
            },
            select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
        });

        const clientUrl = (process.env.CLIENT_URL || "http://localhost:5173").replace(/\/+$/, "");
        const link = `${clientUrl}/registro?token=${token}`;

        const sent = await sendInvitationEmail({ email, role, inviterName: req.user.name, link });
        if (!sent) {
            await prisma.invitation.delete({ where: { id: invitation.id } });
            return res.status(502).json({ message: "No se pudo enviar el correo de invitación. Intenta de nuevo." });
        }

        res.status(201).json(invitation);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al crear la invitación" });
    }
});

// DELETE /api/invitations/:id — revocar invitación pendiente
router.delete("/:id", requireAuth, requireRole("admin", "lead"), async (req, res) => {
    try {
        const invitation = await prisma.invitation.findUnique({ where: { id: req.params.id } });
        if (!invitation || invitation.usedAt) {
            return res.status(404).json({ message: "Invitación no encontrada" });
        }
        if (req.user.role === "lead" && invitation.role !== "operator") {
            return res.status(403).json({ message: "Sin permisos suficientes" });
        }
        await prisma.invitation.delete({ where: { id: invitation.id } });
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al revocar la invitación" });
    }
});

export default router;
