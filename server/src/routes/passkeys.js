import { Router } from "express";
import crypto from "crypto";
import {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const SECRET = process.env.JWT_SECRET;

const RP_NAME = "SLC Turnos";
const RP_ID = process.env.RP_ID || "localhost";
const ORIGIN = process.env.CLIENT_URL || "http://localhost:5173";

// ─── Challenge store (in-memory, TTL 5 min) ──────────────────────────────────
const challenges = new Map();

function storeChallenge(key, challenge) {
    const timer = setTimeout(() => challenges.delete(key), 5 * 60 * 1000);
    challenges.set(key, { challenge, timer });
}

function consumeChallenge(key) {
    const entry = challenges.get(key);
    if (!entry) return null;
    clearTimeout(entry.timer);
    challenges.delete(key);
    return entry.challenge;
}

function signToken(user) {
    return jwt.sign(
        { id: user.id, name: user.name, email: user.email, role: user.role },
        SECRET,
        { expiresIn: "8h" }
    );
}

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
});

// ─── REGISTRATION ─────────────────────────────────────────────────────────────

// POST /api/passkeys/register/options  (requiere sesión activa)
router.post("/register/options", requireAuth, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            include: { passkeys: { select: { credentialId: true, transports: true } } },
        });
        if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

        const options = await generateRegistrationOptions({
            rpName: RP_NAME,
            rpID: RP_ID,
            userName: user.email,
            userDisplayName: user.name,
            userID: new TextEncoder().encode(user.id),
            attestationType: "none",
            excludeCredentials: user.passkeys.map((pk) => ({
                id: pk.credentialId,
                transports: pk.transports ? JSON.parse(pk.transports) : [],
            })),
            authenticatorSelection: {
                residentKey: "required",
                userVerification: "required",
                authenticatorAttachment: "platform",
            },
        });

        storeChallenge(`reg:${user.id}`, options.challenge);
        res.json(options);
    } catch (err) {
        console.error("[Passkey] register/options error:", err);
        res.status(500).json({ message: "Error generando opciones de registro" });
    }
});

// POST /api/passkeys/register/verify  (requiere sesión activa)
router.post("/register/verify", requireAuth, async (req, res) => {
    try {
        const challenge = consumeChallenge(`reg:${req.user.id}`);
        if (!challenge) return res.status(400).json({ message: "Sesión expirada, intenta de nuevo" });

        const verification = await verifyRegistrationResponse({
            response: req.body,
            expectedChallenge: challenge,
            expectedOrigin: ORIGIN,
            expectedRPID: RP_ID,
            requireUserVerification: true,
        });

        if (!verification.verified || !verification.registrationInfo) {
            return res.status(400).json({ message: "Verificación fallida" });
        }

        const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

        await prisma.passkey.create({
            data: {
                userId: req.user.id,
                credentialId: credential.id,
                publicKey: Buffer.from(credential.publicKey),
                counter: credential.counter,
                deviceType: credentialDeviceType,
                backedUp: credentialBackedUp,
                transports: credential.transports ? JSON.stringify(credential.transports) : null,
            },
        });

        console.log(`[Passkey] Registrada para usuario ${req.user.email}`);
        res.json({ ok: true });
    } catch (err) {
        console.error("[Passkey] register/verify error:", err);
        res.status(500).json({ message: "Error verificando registro" });
    }
});

// ─── AUTHENTICATION ───────────────────────────────────────────────────────────

// GET /api/passkeys/login/options  (público)
router.get("/login/options", loginLimiter, async (req, res) => {
    try {
        const options = await generateAuthenticationOptions({
            rpID: RP_ID,
            allowCredentials: [], // discoverable — el dispositivo elige
            userVerification: "required",
        });

        const key = crypto.randomUUID();
        storeChallenge(`login:${key}`, options.challenge);

        res.json({ ...options, _challengeKey: key });
    } catch (err) {
        console.error("[Passkey] login/options error:", err);
        res.status(500).json({ message: "Error generando opciones de autenticación" });
    }
});

// POST /api/passkeys/login/verify  (público)
router.post("/login/verify", loginLimiter, async (req, res) => {
    const { _challengeKey, ...response } = req.body;
    if (!_challengeKey) return res.status(400).json({ message: "challengeKey requerido" });

    try {
        const challenge = consumeChallenge(`login:${_challengeKey}`);
        if (!challenge) return res.status(400).json({ message: "Sesión expirada, intenta de nuevo" });

        const passkey = await prisma.passkey.findUnique({
            where: { credentialId: response.id },
            include: { user: true },
        });
        if (!passkey) return res.status(401).json({ message: "Passkey no reconocida" });
        if (!passkey.user.active) return res.status(401).json({ message: "Cuenta inactiva" });

        const verification = await verifyAuthenticationResponse({
            response,
            expectedChallenge: challenge,
            expectedOrigin: ORIGIN,
            expectedRPID: RP_ID,
            credential: {
                id: passkey.credentialId,
                publicKey: new Uint8Array(passkey.publicKey),
                counter: Number(passkey.counter),
                transports: passkey.transports ? JSON.parse(passkey.transports) : undefined,
            },
            requireUserVerification: true,
        });

        if (!verification.verified) return res.status(401).json({ message: "Verificación fallida" });

        await prisma.passkey.update({
            where: { credentialId: passkey.credentialId },
            data: { counter: verification.authenticationInfo.newCounter },
        });

        const { user } = passkey;
        console.log(`[Passkey] Login exitoso: ${user.email}`);
        res.json({
            token: signToken(user),
            user: { id: user.id, name: user.name, email: user.email, role: user.role, tutorialDone: user.tutorialDone },
        });
    } catch (err) {
        console.error("[Passkey] login/verify error:", err);
        res.status(500).json({ message: "Error verificando autenticación" });
    }
});

// ─── MANAGEMENT ───────────────────────────────────────────────────────────────

// GET /api/passkeys  (requiere sesión)
router.get("/", requireAuth, async (req, res) => {
    try {
        const passkeys = await prisma.passkey.findMany({
            where: { userId: req.user.id },
            select: { id: true, deviceType: true, backedUp: true, createdAt: true },
            orderBy: { createdAt: "desc" },
        });
        res.json(passkeys);
    } catch (err) {
        res.status(500).json({ message: "Error obteniendo passkeys" });
    }
});

// DELETE /api/passkeys/:id  (requiere sesión)
router.delete("/:id", requireAuth, async (req, res) => {
    try {
        const pk = await prisma.passkey.findUnique({ where: { id: req.params.id } });
        if (!pk || pk.userId !== req.user.id) return res.status(404).json({ message: "Passkey no encontrada" });
        await prisma.passkey.delete({ where: { id: req.params.id } });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ message: "Error eliminando passkey" });
    }
});

export default router;
