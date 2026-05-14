import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// GET vapid public key
router.get("/vapid-public-key", (req, res) => {
    res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || "" });
});

// POST subscribe
router.post("/subscribe", requireAuth, async (req, res) => {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ message: "Suscripción inválida" });
    }
    try {
        await prisma.pushSubscription.upsert({
            where: { endpoint },
            update: { p256dh: keys.p256dh, auth: keys.auth, userId: req.user.id },
            create: { userId: req.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
        });
        res.json({ ok: true });
    } catch (err) {
        console.error("[Push] subscribe error:", err);
        res.status(500).json({ message: "Error al guardar suscripción" });
    }
});

// DELETE unsubscribe
router.delete("/unsubscribe", requireAuth, async (req, res) => {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ message: "Falta endpoint" });
    try {
        await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.user.id } });
        res.json({ ok: true });
    } catch {
        res.status(500).json({ message: "Error" });
    }
});

export default router;
