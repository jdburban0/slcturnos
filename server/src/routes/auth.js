import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { prisma } from "../lib/prisma.js";
import { sendPasswordResetEmail } from "../lib/mailer.js";
import { findValidInvitation } from "./invitations.js";

const router = Router();

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { message: "Demasiados intentos, espera 15 minutos" },
    standardHeaders: true,
    legacyHeaders: false,
});

// Solicitar código de restablecimiento: pocas veces por IP para evitar spam de correos
const forgotLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { message: "Demasiadas solicitudes, espera 15 minutos" },
    standardHeaders: true,
    legacyHeaders: false,
});

// Ingresar el código: limita la fuerza bruta del código de 6 dígitos
const resetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { message: "Demasiados intentos, espera 15 minutos" },
    standardHeaders: true,
    legacyHeaders: false,
});

const registerLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { message: "Demasiados intentos, espera 15 minutos" },
    standardHeaders: true,
    legacyHeaders: false,
});

// Mínimo 8 caracteres, al menos una mayúscula y un número
function isStrongPassword(pwd) {
    return typeof pwd === "string" && pwd.length >= 8 && /[A-Z]/.test(pwd) && /\d/.test(pwd);
}

const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error("JWT_SECRET no está definido en las variables de entorno");

function signToken(user) {
    return jwt.sign(
        { id: user.id, name: user.name, email: user.email, role: user.role },
        SECRET,
        { expiresIn: "8h" }
    );
}

router.post("/login", loginLimiter, async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: "Correo y contraseña requeridos" });
    }

    try {
        const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
        if (!user || !user.active) {
            return res.status(401).json({ message: "Credenciales inválidas" });
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
            return res.status(401).json({ message: "Credenciales inválidas" });
        }

        res.json({
            token: signToken(user),
            user: { id: user.id, name: user.name, email: user.email, role: user.role, tutorialDone: user.tutorialDone },
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error del servidor" });
    }
});

router.post("/register", registerLimiter, async (req, res) => {
    const { token, name, email, password, group } = req.body ?? {};

    if (!token) {
        return res.status(400).json({ message: "Necesitas una invitación para registrarte" });
    }
    if (!name || !String(name).trim()) {
        return res.status(400).json({ message: "El nombre es requerido" });
    }
    if (!isStrongPassword(password)) {
        return res.status(400).json({ message: "La contraseña debe tener al menos 8 caracteres, una mayúscula y un número" });
    }

    try {
        const invitation = await findValidInvitation(token);
        if (!invitation) {
            return res.status(400).json({ message: "Esta invitación no es válida o ya expiró. Pide una nueva a tu supervisor." });
        }

        const inviteEmail = invitation.email.toLowerCase();
        if (email && String(email).toLowerCase().trim() !== inviteEmail) {
            return res.status(400).json({ message: "El correo no coincide con el de la invitación" });
        }
        if (!inviteEmail.endsWith("@sig.systems")) {
            return res.status(400).json({ message: "Solo puedes usar el correo corporativo" });
        }

        const role = invitation.role === "lead" ? "lead" : "operator";
        if (role === "operator" && group !== "E1" && group !== "E2") {
            return res.status(400).json({ message: "Debes seleccionar tu grupo (E1 o E2)" });
        }

        const existing = await prisma.user.findUnique({ where: { email: inviteEmail } });
        if (existing) {
            return res.status(409).json({ message: "Ya existe una cuenta con ese correo" });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const user = await prisma.$transaction(async (tx) => {
            // Marcar la invitación como usada solo si sigue libre (evita doble uso simultáneo)
            const { count } = await tx.invitation.updateMany({
                where: { id: invitation.id, usedAt: null, expiresAt: { gt: new Date() } },
                data: { usedAt: new Date() },
            });
            if (count !== 1) {
                throw Object.assign(new Error("Esta invitación ya fue usada"), { status: 400 });
            }
            return tx.user.create({
                data: {
                    name: String(name).trim(),
                    email: inviteEmail,
                    passwordHash,
                    role,
                    ...(role === "operator" && { group }),
                },
            });
        });

        res.status(201).json({
            token: signToken(user),
            user: { id: user.id, name: user.name, email: user.email, role: user.role, tutorialDone: user.tutorialDone },
        });
    } catch (err) {
        if (err.status === 400) return res.status(400).json({ message: err.message });
        console.error(err);
        res.status(500).json({ message: "Error del servidor" });
    }
});

router.patch("/change-password", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: "No autorizado" });

    const token = authHeader.split(" ")[1];
    let payload;
    try {
        payload = jwt.verify(token, SECRET);
    } catch {
        return res.status(401).json({ message: "Token inválido" });
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Faltan campos requeridos" });
    }
    if (newPassword.length < 6) {
        return res.status(400).json({ message: "La nueva contraseña debe tener al menos 6 caracteres" });
    }

    try {
        const user = await prisma.user.findUnique({ where: { id: payload.id } });
        if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

        const valid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!valid) return res.status(401).json({ message: "Contraseña actual incorrecta" });

        const passwordHash = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

        res.json({ message: "Contraseña actualizada correctamente" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error del servidor" });
    }
});

router.post("/forgot-password", forgotLimiter, async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ message: "El correo es requerido" });
    }

    try {
        const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

        if (!user) {
            return res.json({ message: "Si el correo existe, recibirás un código" });
        }

        const code = String(crypto.randomInt(100000, 1000000));

        await prisma.passwordResetToken.deleteMany({ where: { email: email.toLowerCase() } });
        await prisma.passwordResetToken.create({
            data: {
                email: email.toLowerCase(),
                code,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            },
        });

        await sendPasswordResetEmail({ email: email.toLowerCase(), name: user.name, code });

        res.json({ message: "Si el correo existe, recibirás un código" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error del servidor" });
    }
});

router.post("/reset-password", resetLimiter, async (req, res) => {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
        return res.status(400).json({ message: "Faltan campos requeridos" });
    }
    if (newPassword.length < 6) {
        return res.status(400).json({ message: "La nueva contraseña debe tener al menos 6 caracteres" });
    }

    try {
        const token = await prisma.passwordResetToken.findFirst({
            where: {
                email: email.toLowerCase(),
                code,
                used: false,
                expiresAt: { gt: new Date() },
            },
        });

        if (!token) {
            return res.status(400).json({ message: "Código inválido o expirado" });
        }

        const passwordHash = await bcrypt.hash(newPassword, 10);

        await prisma.$transaction([
            prisma.passwordResetToken.update({
                where: { id: token.id },
                data: { used: true },
            }),
            prisma.user.update({
                where: { email: email.toLowerCase() },
                data: { passwordHash },
            }),
        ]);

        res.json({ message: "Contraseña actualizada" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error del servidor" });
    }
});

export default router;
