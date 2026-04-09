import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// GET own notifications
router.get("/", requireAuth, async (req, res) => {
    try {
        const notifications = await prisma.notification.findMany({
            where: { userId: req.user.id },
            orderBy: { createdAt: "desc" },
            take: 30,
        });
        res.json(notifications);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al obtener notificaciones" });
    }
});

// PATCH mark all as read
router.patch("/read-all", requireAuth, async (req, res) => {
    try {
        await prisma.notification.updateMany({
            where: { userId: req.user.id, isRead: false },
            data: { isRead: true },
        });
        res.json({ message: "Todas marcadas como leídas" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error" });
    }
});

// PATCH mark one as read
router.patch("/:id/read", requireAuth, async (req, res) => {
    try {
        const notification = await prisma.notification.update({
            where: { id: req.params.id },
            data: { isRead: true },
        });
        res.json(notification);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al marcar notificación" });
    }
});

export default router;
