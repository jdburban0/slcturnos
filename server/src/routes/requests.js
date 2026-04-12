import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { queueShiftResultEmail } from "../lib/mailer.js";

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
            const approvedRequests = await prisma.shiftRequest.count({
                where: { shiftId: request.shiftId, status: "APPROVED" },
            });
            const manualCount = await prisma.manualAssignment.count({
                where: { shiftId: request.shiftId },
            });
            if (approvedRequests + manualCount >= request.shift.totalSlots) {
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

        // Auto-close shift if all slots are now filled, and reject remaining pending requests
        if (action === "approve") {
            const approvedReqs = await prisma.shiftRequest.count({
                where: { shiftId: request.shiftId, status: "APPROVED" },
            });
            const manualAssigned = await prisma.manualAssignment.count({
                where: { shiftId: request.shiftId },
            });
            const approvedCount = approvedReqs + manualAssigned;
            if (approvedCount >= request.shift.totalSlots) {
                await prisma.shift.update({
                    where: { id: request.shiftId },
                    data: { status: "FULL" },
                });

                // Reject all remaining pending requests for this shift
                const pendingRequests = await prisma.shiftRequest.findMany({
                    where: { shiftId: request.shiftId, status: "PENDING" },
                    select: { id: true, userId: true, user: { select: { name: true, email: true } } },
                });

                if (pendingRequests.length > 0) {
                    await prisma.shiftRequest.updateMany({
                        where: { id: { in: pendingRequests.map((r) => r.id) } },
                        data: {
                            status: "REJECTED",
                            reviewedBy: req.user.id,
                            reviewedAt: new Date(),
                            notes: "Turno no disponible",
                        },
                    });

                    await prisma.notification.createMany({
                        data: pendingRequests.map((r) => ({
                            userId: r.userId,
                            title: "Turno rechazado",
                            message: `Tu solicitud para "${request.shift.title}" fue rechazada. Turno no disponible.`,
                        })),
                    });

                    const io = req.app.get("io");
                    const shiftDate = new Date(request.shift.date).toLocaleDateString("es-CO", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
                    for (const r of pendingRequests) {
                        io.to(`user:${r.userId}`).emit("notification:new");
                        queueShiftResultEmail({
                            userId: r.userId,
                            to: r.user.email,
                            name: r.user.name,
                            shiftTitle: request.shift.title,
                            shiftDate,
                            status: "REJECTED",
                            notes: "Turno no disponible",
                        });
                    }
                }
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

        queueShiftResultEmail({
            userId: request.userId,
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

// DELETE cancel own pending or approved request (operator desiste)
router.delete("/:id", requireAuth, async (req, res) => {
    const { id } = req.params;
    try {
        const request = await prisma.shiftRequest.findUnique({ where: { id }, include: { shift: true } });
        if (!request) return res.status(404).json({ message: "Solicitud no encontrada" });
        if (request.userId !== req.user.id && req.user.role === "operator") {
            return res.status(403).json({ message: "Sin permisos" });
        }
        if (!["PENDING", "APPROVED"].includes(request.status)) {
            return res.status(400).json({ message: "No se puede cancelar esta solicitud" });
        }

        await prisma.shiftRequest.update({ where: { id }, data: { status: "CANCELLED" } });

        if (request.shift.status === "FULL") {
            const approvedCount = await prisma.shiftRequest.count({
                where: { shiftId: request.shiftId, status: "APPROVED" },
            });
            const manualCount = await prisma.manualAssignment.count({ where: { shiftId: request.shiftId } });
            if (approvedCount + manualCount < request.shift.totalSlots) {
                await prisma.shift.update({ where: { id: request.shiftId }, data: { status: "OPEN" } });
            }
        }

        const io = req.app.get("io");
        io.to("admins").emit("requests:refresh");
        io.emit("shifts:refresh");

        res.json({ message: "Solicitud cancelada" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al cancelar solicitud" });
    }
});

// POST solicitar desistir (sin traspaso) — queda pendiente de aprobación del admin
router.post("/:id/withdraw", requireAuth, async (req, res) => {
    const { id } = req.params;
    try {
        const request = await prisma.shiftRequest.findUnique({
            where: { id },
            include: { shift: true, transfer: true },
        });
        if (!request) return res.status(404).json({ message: "Solicitud no encontrada" });
        if (request.userId !== req.user.id) return res.status(403).json({ message: "Sin permisos" });
        if (request.status !== "APPROVED") return res.status(400).json({ message: "Solo puedes desistir de turnos aprobados" });
        if (request.transfer) return res.status(400).json({ message: "Ya tienes una solicitud pendiente para este turno" });

        const transfer = await prisma.shiftTransfer.create({
            data: { requestId: id, shiftId: request.shiftId, fromUserId: req.user.id },
        });

        const io = req.app.get("io");
        io.to("admins").emit("transfers:refresh");

        res.status(201).json(transfer);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al solicitar desistimiento" });
    }
});

// POST solicitar traspaso de turno aprobado a un compañero
router.post("/:id/transfer", requireAuth, async (req, res) => {
    const { id } = req.params;
    const { toName, toEmail } = req.body;
    if (!toName || !toEmail) return res.status(400).json({ message: "Nombre y correo del compañero son requeridos" });

    try {
        const request = await prisma.shiftRequest.findUnique({
            where: { id },
            include: { shift: true, transfer: true },
        });
        if (!request) return res.status(404).json({ message: "Solicitud no encontrada" });
        if (request.userId !== req.user.id) return res.status(403).json({ message: "Sin permisos" });
        if (request.status !== "APPROVED") return res.status(400).json({ message: "Solo puedes traspasar turnos aprobados" });
        if (request.transfer) return res.status(400).json({ message: "Ya tienes una solicitud pendiente para este turno" });

        const transfer = await prisma.shiftTransfer.create({
            data: { requestId: id, shiftId: request.shiftId, fromUserId: req.user.id, toName: toName.trim(), toEmail: toEmail.trim() },
        });

        const io = req.app.get("io");
        io.to("admins").emit("transfers:refresh");

        res.status(201).json(transfer);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al crear traspaso" });
    }
});

export default router;
