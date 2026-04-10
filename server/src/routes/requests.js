import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { sendShiftResultEmail } from "../lib/mailer.js";

const router = Router();

// GET pending requests (admin/lead) or own requests (operator)
router.get("/", requireAuth, async (req, res) => {
    try {
        const where =
            req.user.role === "operator"
                ? { userId: req.user.id }
                : { status: "PENDING" };

        const requests = await prisma.shiftRequest.findMany({
            where,
            include: {
                user: { select: { id: true, name: true, email: true } },
                shift: true,
            },
            orderBy: { createdAt: "asc" },
        });
        res.json(requests);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al obtener solicitudes" });
    }
});

// PATCH approve or reject a request (admin/lead only)
router.patch("/:id", requireAuth, requireRole("admin", "lead"), async (req, res) => {
    const { id } = req.params;
    const { action, notes } = req.body;

    if (!["approve", "reject"].includes(action)) {
        return res.status(400).json({ message: "Acción inválida. Usa 'approve' o 'reject'" });
    }

    try {
        const request = await prisma.shiftRequest.findUnique({
            where: { id },
            include: {
                shift: true,
                user: { select: { name: true, email: true } },
            },
        });

        if (!request) return res.status(404).json({ message: "Solicitud no encontrada" });
        if (request.status !== "PENDING") {
            return res.status(400).json({ message: "Solo se pueden revisar solicitudes pendientes" });
        }

        if (action === "approve") {
            const approvedCount = await prisma.shiftRequest.count({
                where: { shiftId: request.shiftId, status: "APPROVED" },
            });
            if (approvedCount >= request.shift.totalSlots) {
                return res.status(400).json({ message: "No hay cupos disponibles en este turno" });
            }
        }

        const newStatus = action === "approve" ? "APPROVED" : "REJECTED";

        const updated = await prisma.shiftRequest.update({
            where: { id },
            data: {
                status: newStatus,
                reviewedBy: req.user.id,
                reviewedAt: new Date(),
                notes: notes || null,
            },
            include: {
                user: { select: { id: true, name: true, email: true } },
                shift: true,
            },
        });

        // Auto-close shift if all slots are now filled
        if (action === "approve") {
            const approvedCount = await prisma.shiftRequest.count({
                where: { shiftId: request.shiftId, status: "APPROVED" },
            });
            if (approvedCount >= request.shift.totalSlots) {
                await prisma.shift.update({
                    where: { id: request.shiftId },
                    data: { status: "FULL" },
                });
            }
        }

        // Create notification for the operator
        const isApproved = action === "approve";
        const notification = await prisma.notification.create({
            data: {
                userId: request.userId,
                title: isApproved ? "Turno aprobado" : "Turno rechazado",
                message: isApproved
                    ? `Tu solicitud para "${request.shift.title}" fue aprobada. ¡Listo para trabajar!`
                    : `Tu solicitud para "${request.shift.title}" fue rechazada.${notes ? ` Nota: ${notes}` : ""}`,
            },
        });

        const io = req.app.get("io");
        io.to("admins").emit("requests:refresh");
        io.emit("shifts:refresh");
        io.to(`user:${request.userId}`).emit("notification:new", notification);

        // Email al operador (no bloquea la respuesta)
        sendShiftResultEmail({
            to: request.user.email,
            name: request.user.name,
            shiftTitle: request.shift.title,
            shiftDate: new Date(request.shift.date).toLocaleDateString("es-CO", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
            status: newStatus,
            notes: notes || null,
        });

        res.json(updated);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al procesar solicitud" });
    }
});

// DELETE cancel own pending request (operator)
router.delete("/:id", requireAuth, async (req, res) => {
    const { id } = req.params;
    try {
        const request = await prisma.shiftRequest.findUnique({ where: { id } });
        if (!request) return res.status(404).json({ message: "Solicitud no encontrada" });
        if (request.userId !== req.user.id && req.user.role === "operator") {
            return res.status(403).json({ message: "Sin permisos" });
        }
        if (request.status !== "PENDING") {
            return res.status(400).json({ message: "Solo se pueden cancelar solicitudes pendientes" });
        }

        await prisma.shiftRequest.update({
            where: { id },
            data: { status: "CANCELLED" },
        });

        const io = req.app.get("io");
        io.to("admins").emit("requests:refresh");
        io.emit("shifts:refresh");

        res.json({ message: "Solicitud cancelada" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al cancelar solicitud" });
    }
});

export default router;
