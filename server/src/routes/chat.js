import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { sendPushToUser } from "../lib/pushService.js";

const router = Router();

// Filtro reutilizable: mensajes visibles para el usuario actual (excluye borrados para él)
function visibleForUser(myId, otherId) {
    return {
        OR: [
            {
                senderId: myId, recipientId: otherId,
                OR: [{ deletedBySender: false }, { deletedForAll: true }],
            },
            {
                senderId: otherId, recipientId: myId,
                OR: [{ deletedByRecipient: false }, { deletedForAll: true }],
            },
        ],
    };
}

// GET /api/chat/contacts
router.get("/contacts", requireAuth, async (req, res) => {
    try {
        const isAdmin = ["admin", "lead"].includes(req.user.role);

        const contacts = await prisma.user.findMany({
            where: isAdmin
                ? { role: "operator", active: true }
                : { role: { in: ["admin", "lead"] }, active: true, hideFromChat: false },
            select: { id: true, name: true, role: true },
            orderBy: { name: "asc" },
        });

        const withUnread = await Promise.all(contacts.map(async (c) => {
            const unread = await prisma.message.count({
                where: { senderId: c.id, recipientId: req.user.id, isRead: false, deletedByRecipient: false },
            });
            const lastMsg = await prisma.message.findFirst({
                where: visibleForUser(req.user.id, c.id),
                orderBy: { createdAt: "desc" },
                select: { content: true, createdAt: true, senderId: true, deletedForAll: true },
            });
            return { contact: c, unread, lastMsg };
        }));

        if (isAdmin) {
            withUnread.sort((a, b) => {
                if (!a.lastMsg && !b.lastMsg) return 0;
                if (!a.lastMsg) return 1;
                if (!b.lastMsg) return -1;
                return new Date(b.lastMsg.createdAt) - new Date(a.lastMsg.createdAt);
            });
        }

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
            where: visibleForUser(req.user.id, req.params.userId),
            include: { sender: { select: { id: true, name: true, role: true } } },
            orderBy: { createdAt: "asc" },
        });
        // Para mensajes deletedForAll, ocultar el contenido real
        const sanitized = messages.map((m) =>
            m.deletedForAll ? { ...m, content: "" } : m
        );
        res.json(sanitized);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al obtener mensajes" });
    }
});

// POST /api/chat — enviar mensaje
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

// DELETE /api/chat/message/:messageId — eliminar mensaje (scope: "me" | "all")
router.delete("/message/:messageId", requireAuth, async (req, res) => {
    try {
        const msg = await prisma.message.findUnique({ where: { id: req.params.messageId } });
        if (!msg) return res.status(404).json({ message: "Mensaje no encontrado" });
        if (msg.senderId !== req.user.id && msg.recipientId !== req.user.id)
            return res.status(403).json({ message: "No autorizado" });

        const scope = req.body?.scope ?? "me"; // "me" | "all"
        const isSender = msg.senderId === req.user.id;

        if (scope === "all") {
            // Solo el remitente puede borrar para todos
            if (!isSender) return res.status(403).json({ message: "Solo el remitente puede eliminar para todos" });
            await prisma.message.update({
                where: { id: req.params.messageId },
                data: { deletedForAll: true, content: "" },
            });
            const io = req.app.get("io");
            io.to(`user:${msg.recipientId}`).emit("chat:messageDeleted", {
                messageId: req.params.messageId,
                deletedForAll: true,
            });
        } else {
            // Eliminar solo para el usuario actual
            await prisma.message.update({
                where: { id: req.params.messageId },
                data: isSender ? { deletedBySender: true } : { deletedByRecipient: true },
            });
            // Sin evento socket — solo afecta al usuario actual
        }

        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al eliminar mensaje" });
    }
});

// DELETE /api/chat/conversation/:userId — eliminar toda la conversación (solo para mí)
router.delete("/conversation/:userId", requireAuth, async (req, res) => {
    try {
        const isSender = { senderId: req.user.id, recipientId: req.params.userId };
        const isRecipient = { senderId: req.params.userId, recipientId: req.user.id };
        // Marcar mensajes enviados como borrados para el remitente
        await prisma.message.updateMany({ where: isSender, data: { deletedBySender: true } });
        // Marcar mensajes recibidos como borrados para el destinatario
        await prisma.message.updateMany({ where: isRecipient, data: { deletedByRecipient: true } });
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
