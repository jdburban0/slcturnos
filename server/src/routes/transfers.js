import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { sendAssignmentEmail } from "../lib/mailer.js";

const router = Router();

router.get("/", requireAuth, requireRole("admin", "lead"), async (req, res) => {
    try {
        const transfers = await prisma.shiftTransfer.findMany({
            where: { status: "PENDING" },
            include: {
                shift: true,
                fromUser: { select: { id: true, name: true, email: true } },
            },
            orderBy: { createdAt: "asc" },
        });
        res.json(transfers);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al obtener cesiones" });
    }
});

router.patch("/:id", requireAuth, requireRole("admin", "lead"), async (req, res) => {
    const { id } = req.params;
    const { action, notes } = req.body;
    if (!["approve", "reject"].includes(action)) {
        return res.status(400).json({ message: "Acción inválida" });
    }

    try {
        const transfer = await prisma.shiftTransfer.findUnique({
            where: { id },
            include: {
                shift: true,
                fromUser: { select: { name: true, email: true } },
                request: { include: { user: true } },
            },
        });

        if (!transfer) return res.status(404).json({ message: "Traspaso no encontrada" });
        if (transfer.status !== "PENDING") return res.status(400).json({ message: "Esta traspaso ya fue procesada" });

        if (action === "approve") {
            // Cancel the original request
            await prisma.shiftRequest.update({
                where: { id: transfer.requestId },
                data: { status: "CANCELLED" },
            });

            // Reopen shift if it was FULL
            if (transfer.shift.status === "FULL") {
                await prisma.shift.update({
                    where: { id: transfer.shiftId },
                    data: { status: "OPEN" },
                });
            }

            const isTransfer = !!transfer.toName;

            await prisma.notification.create({
                data: {
                    userId: transfer.fromUserId,
                    title: isTransfer ? "Traspaso aprobado" : "Desistimiento aprobado",
                    message: isTransfer
                        ? `Tu traspaso del turno "${transfer.shift.title}" a ${transfer.toName} fue aprobado.`
                        : `Tu solicitud para desistir del turno "${transfer.shift.title}" fue aprobada.`,
                },
            });

            if (isTransfer) {
                sendAssignmentEmail({
                    name: transfer.toName,
                    email: transfer.toEmail,
                    shiftTitle: transfer.shift.title,
                    shiftDate: new Date(transfer.shift.date).toLocaleDateString("es-CO", {
                        weekday: "long", year: "numeric", month: "long", day: "numeric",
                    }),
                    startTime: transfer.shift.startTime,
                    endTime: transfer.shift.endTime,
                });
            }
        } else {
            const isTransfer = !!transfer.toName;
            await prisma.notification.create({
                data: {
                    userId: transfer.fromUserId,
                    title: isTransfer ? "Traspaso rechazado" : "Desistimiento rechazado",
                    message: isTransfer
                        ? `Tu traspaso del turno "${transfer.shift.title}" a ${transfer.toName} fue rechazado.${notes ? ` Motivo: ${notes}` : ""}`
                        : `Tu solicitud para desistir del turno "${transfer.shift.title}" fue rechazada.${notes ? ` Motivo: ${notes}` : ""}`,
                },
            });
        }

        const updated = await prisma.shiftTransfer.update({
            where: { id },
            data: { status: action === "approve" ? "APPROVED" : "REJECTED", reviewedBy: req.user.id, reviewedAt: new Date(), notes: notes || null },
        });

        const io = req.app.get("io");
        io.to("admins").emit("transfers:refresh");
        io.emit("shifts:refresh");
        io.to(`user:${transfer.fromUserId}`).emit("notification:new");

        res.json(updated);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al procesar traspaso" });
    }
});

export default router;
