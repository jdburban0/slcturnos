import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { sendPushToUser } from "../lib/pushService.js";

const router = Router();

// GET /api/chat/contacts — lista de personas con quien chatear
// Operador → admins/leads activos
// Admin/lead → operadores que les han escrito (o todos los activos)
router.get("/contacts", requireAuth, async (req, res) => {
    try {
        const isAdmin = ["admin", "lead"].includes(req.user.role);

        if (!isAdmin) {
            // Operador: lista de admins/leads activos
            const contacts = await prisma.user.findMany({
                where: { role: { in: ["admin", "lead"] }, active: true },
                select: { id: true, name: true, role: true },
                orderBy: { name: "asc" },
            });
            // Unread por cada contacto (mensajes que me enviaron y no he leído)
            const withUnread = await Promise.all(contacts.map(async (c) => {
                const unread = await prisma.message.count({
                    where: { senderId: c.id, recipientId: req.user.id, isRead: false },
                });
                const lastMsg = await prisma.message.findFirst({
                    where: {
                        OR: [
                            { senderId: req.user.id, recipientId: c.id },
                            { senderId: c.id, recipientId: req.user.id },
                        ],
                    },
                    orderBy: { createdAt: "desc" },
                    select: { content: true, createdAt: true, senderId: true },
                });
                return { contact: c, unread, lastMsg };
            }));
            return res.json(withUnread);
        }

        // Admin/lead: todos los operadores activos
        const contacts = await prisma.user.findMany({
            where: { role: "operator", active: true },
            select: { id: true, name: true, role: true },
            orderBy: { name: "asc" },
        });
        const withUnread = await Promise.all(contacts.map(async (c) => {
            const unread = await prisma.message.count({
                where: { senderId: c.id, recipientId: req.user.id, isRead: false },
            });
            const lastMsg = await prisma.message.findFirst({
                where: {
                    OR: [
                        { senderId: req.user.id, recipientId: c.id },
                        { senderId: c.id, recipientId: req.user.id },
                    ],
                },
                orderBy: { createdAt: "desc" },
                select: { content: true, createdAt: true, senderId: true },
            });
            return { contact: c, unread, lastMsg };
        }));
        // Ordenar: primero los que tienen mensajes (por recencia), luego los demás
        withUnread.sort((a, b) => {
            if (!a.lastMsg && !b.lastMsg) return 0;
            if (!a.lastMsg) return 1;
            if (!b.lastMsg) return -1;
            return new Date(b.lastMsg.createdAt) - new Date(a.lastMsg.createdAt);
        });
        return res.json(withUnread);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al obtener contactos" });
    }
});

// GET /api/chat/:userId — mensajes entre el usuario actual y userId
router.get("/:userId", requireAuth, async (req, res) => {
    try {
        const messages = await prisma.message.findMany({
            where: {
                OR: [
                    { senderId: req.user.id, recipientId: req.params.userId },
                    { senderId: req.params.userId, recipientId: req.user.id },
                ],
            },
            include: { sender: { select: { id: true, name: true, role: true } } },
            orderBy: { createdAt: "asc" },
        });
        res.json(messages);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al obtener mensajes" });
    }
});

// POST /api/chat — enviar mensaje a un destinatario específico
router.post("/", requireAuth, async (req, res) => {
    const { content, recipientId } = req.body;
    if (!content?.trim()) return res.status(400).json({ message: "Mensaje vacío" });
    if (!recipientId) return res.status(400).json({ message: "recipientId requerido" });

    try {
        const message = await prisma.message.create({
            data: { senderId: req.user.id, recipientId, content: content.trim() },
            include: { sender: { select: { id: true, name: true, role: true } } },
        });

        const io = req.app.get("io");
        io.to(`user:${recipientId}`).emit("chat:message", message);

        sendPushToUser(recipientId, `Mensaje de ${req.user.name}`, message.content).catch(() => {});

        res.status(201).json(message);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al enviar mensaje" });
    }
});

// DELETE /api/chat/message/:messageId — eliminar un mensaje individual
router.delete("/message/:messageId", requireAuth, async (req, res) => {
    try {
        const msg = await prisma.message.findUnique({ where: { id: req.params.messageId } });
        if (!msg) return res.status(404).json({ message: "Mensaje no encontrado" });
        if (msg.senderId !== req.user.id && msg.recipientId !== req.user.id)
            return res.status(403).json({ message: "No autorizado" });
        await prisma.message.delete({ where: { id: req.params.messageId } });
        const otherId = msg.senderId === req.user.id ? msg.recipientId : msg.senderId;
        const io = req.app.get("io");
        io.to(`user:${otherId}`).emit("chat:messageDeleted", { messageId: req.params.messageId });
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al eliminar mensaje" });
    }
});

// DELETE /api/chat/conversation/:userId — eliminar todos los mensajes con userId
router.delete("/conversation/:userId", requireAuth, async (req, res) => {
    try {
        await prisma.message.deleteMany({
            where: {
                OR: [
                    { senderId: req.user.id, recipientId: req.params.userId },
                    { senderId: req.params.userId, recipientId: req.user.id },
                ],
            },
        });
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al eliminar conversación" });
    }
});

// PATCH /api/chat/:userId/read — marcar mensajes de userId como leídos
router.patch("/:userId/read", requireAuth, async (req, res) => {
    try {
        await prisma.message.updateMany({
            where: { senderId: req.params.userId, recipientId: req.user.id, isRead: false },
            data: { isRead: true },
        });
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al marcar como leído" });
    }
});

export default router;
