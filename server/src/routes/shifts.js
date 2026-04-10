import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { sendNewShiftEmail, sendWeeklyScheduleEmail } from "../lib/mailer.js";

const router = Router();

// GET all shifts with their requests
router.get("/", requireAuth, async (req, res) => {
    try {
        const shifts = await prisma.shift.findMany({
            orderBy: [{ date: "asc" }, { startTime: "asc" }],
            include: {
                requests: {
                    where: { status: { in: ["PENDING", "APPROVED"] } },
                    include: { user: { select: { id: true, name: true } } },
                },
            },
        });
        res.json(shifts);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al obtener turnos" });
    }
});

// POST create shift (admin/lead only)
router.post("/", requireAuth, requireRole("admin", "lead"), async (req, res) => {
    const { title, date, startTime, endTime, type, totalSlots } = req.body;
    if (!title || !date || !startTime || !endTime || !type || !totalSlots) {
        return res.status(400).json({ message: "Todos los campos son requeridos" });
    }

    try {
        const shift = await prisma.shift.create({
            data: {
                title,
                date: new Date(date + "T12:00:00"),
                startTime,
                endTime,
                type,
                totalSlots: parseInt(totalSlots),
                createdBy: req.user.id,
            },
            include: { requests: true },
        });

        const io = req.app.get("io");
        io.emit("shifts:refresh");

        // Notificar por email a todos los operadores activos (no bloquea la respuesta)
        prisma.user.findMany({
            where: { role: "operator", active: true },
            select: { name: true, email: true },
        }).then((operators) => {
            sendNewShiftEmail({
                operators,
                shiftTitle: shift.title,
                shiftDate: new Date(shift.date).toLocaleDateString("es-CO", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
                startTime: shift.startTime,
                endTime: shift.endTime,
                totalSlots: shift.totalSlots,
            });
        }).catch((err) => console.error("[Mailer] Error buscando operadores:", err.message));

        res.status(201).json(shift);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al crear turno" });
    }
});

// PATCH update shift (admin/lead only)
router.patch("/:id", requireAuth, requireRole("admin", "lead"), async (req, res) => {
    const { id } = req.params;
    const { title, date, startTime, endTime, totalSlots, status } = req.body;

    try {
        // Guardar cupos anteriores para detectar si aumentaron
        const before = totalSlots !== undefined
            ? await prisma.shift.findUnique({ where: { id }, select: { totalSlots: true } })
            : null;

        const shift = await prisma.shift.update({
            where: { id },
            data: {
                ...(title !== undefined && { title }),
                ...(date !== undefined && { date: new Date(date + "T12:00:00") }),
                ...(startTime !== undefined && { startTime }),
                ...(endTime !== undefined && { endTime }),
                ...(totalSlots !== undefined && { totalSlots: parseInt(totalSlots) }),
                ...(status !== undefined && { status }),
            },
            include: { requests: { where: { status: { in: ["PENDING", "APPROVED"] } } } },
        });

        const io = req.app.get("io");
        io.emit("shifts:refresh");

        // Si aumentaron los cupos, reabrir turno si estaba FULL y ahora hay espacio
        const newSlots = parseInt(totalSlots);
        if (before && newSlots > before.totalSlots && shift.status === "FULL") {
            const approvedCount = await prisma.shiftRequest.count({
                where: { shiftId: shift.id, status: "APPROVED" },
            });
            if (approvedCount < newSlots) {
                await prisma.shift.update({
                    where: { id: shift.id },
                    data: { status: "OPEN" },
                });
            }
        }

        if (before && newSlots > before.totalSlots) {
            const added = newSlots - before.totalSlots;
            prisma.user.findMany({
                where: { role: "operator", active: true },
                select: { name: true, email: true },
            }).then((operators) => {
                sendNewShiftEmail({
                    operators,
                    shiftTitle: shift.title,
                    shiftDate: new Date(shift.date).toLocaleDateString("es-CO", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
                    startTime: shift.startTime,
                    endTime: shift.endTime,
                    totalSlots: added,
                    extraMsg: `Se ${added === 1 ? "abrió 1 cupo nuevo" : `abrieron ${added} cupos nuevos`} en este turno.`,
                });
            }).catch((err) => console.error("[Mailer] Error buscando operadores:", err.message));
        }

        res.json(shift);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al actualizar turno" });
    }
});

// DELETE shift (admin only) — cancels pending requests and notifies users
router.delete("/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const { id } = req.params;
    try {
        const shift = await prisma.shift.findUnique({
            where: { id },
            include: {
                requests: {
                    where: { status: { in: ["PENDING", "APPROVED"] } },
                    select: { userId: true },
                },
            },
        });
        if (!shift) return res.status(404).json({ message: "Turno no encontrado" });

        // Notify affected users
        const affectedUserIds = [...new Set(shift.requests.map((r) => r.userId))];
        if (affectedUserIds.length > 0) {
            await prisma.notification.createMany({
                data: affectedUserIds.map((userId) => ({
                    userId,
                    title: "Turno cancelado",
                    message: `El turno "${shift.title}" fue eliminado por el administrador.`,
                })),
            });
        }

        await prisma.shiftRequest.deleteMany({ where: { shiftId: id } });
        await prisma.shift.delete({ where: { id } });

        const io = req.app.get("io");
        io.emit("shifts:refresh");
        for (const userId of affectedUserIds) {
            io.to(`user:${userId}`).emit("notification:new");
        }

        res.json({ message: "Turno eliminado" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al eliminar turno" });
    }
});

// POST request a shift (operator)
router.post("/:id/request", requireAuth, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    try {
        const shift = await prisma.shift.findUnique({
            where: { id },
            include: {
                requests: { where: { status: { in: ["PENDING", "APPROVED"] } } },
            },
        });

        if (!shift) return res.status(404).json({ message: "Turno no encontrado" });
        if (shift.status !== "OPEN") {
            return res.status(400).json({ message: "Este turno ya no está disponible" });
        }

        const approvedCount = shift.requests.filter((r) => r.status === "APPROVED").length;
        if (approvedCount >= shift.totalSlots) {
            return res.status(400).json({ message: "No hay cupos disponibles" });
        }

        // Block duplicate active requests for the same shift
        const existing = await prisma.shiftRequest.findFirst({
            where: { shiftId: id, userId, status: { in: ["PENDING", "APPROVED"] } },
        });
        if (existing) {
            return res.status(400).json({ message: "Ya tienes una solicitud activa para este turno" });
        }

        const holdExpiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min hold
        const request = await prisma.shiftRequest.create({
            data: { shiftId: id, userId, holdExpiresAt },
            include: {
                user: { select: { id: true, name: true } },
                shift: true,
            },
        });

        const io = req.app.get("io");
        io.to("admins").emit("requests:refresh");
        io.emit("shifts:refresh");

        res.status(201).json(request);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al solicitar turno" });
    }
});

// POST close-week: archives all shifts in a given Mon-Sun week (admin/lead only)
router.post("/close-week", requireAuth, requireRole("admin", "lead"), async (req, res) => {
    const { weekStart } = req.body; // ISO date string of the Monday
    if (!weekStart) return res.status(400).json({ message: "weekStart requerido" });

    const monday = new Date(weekStart + "T00:00:00");
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    try {
        // Find all non-CLOSED shifts in the week
        const shifts = await prisma.shift.findMany({
            where: {
                date: { gte: monday, lte: sunday },
                status: { not: "CLOSED" },
            },
            include: {
                requests: {
                    where: { status: "PENDING" },
                    select: { id: true, userId: true },
                },
            },
        });

        if (shifts.length === 0) {
            return res.status(400).json({ message: "No hay turnos activos en esa semana" });
        }

        // Cancel pending requests and notify affected users
        const allPending = shifts.flatMap((s) => s.requests);
        const affectedUserIds = [...new Set(allPending.map((r) => r.userId))];

        if (allPending.length > 0) {
            await prisma.shiftRequest.updateMany({
                where: { id: { in: allPending.map((r) => r.id) } },
                data: { status: "CANCELLED" },
            });
        }

        if (affectedUserIds.length > 0) {
            await prisma.notification.createMany({
                data: affectedUserIds.map((userId) => ({
                    userId,
                    title: "Semana archivada",
                    message: `Los turnos de la semana del ${weekStart} fueron archivados por el supervisor.`,
                })),
            });
        }

        // Close all shifts in the week
        await prisma.shift.updateMany({
            where: { id: { in: shifts.map((s) => s.id) } },
            data: { status: "CLOSED" },
        });

        const io = req.app.get("io");
        io.emit("shifts:refresh");
        for (const userId of affectedUserIds) {
            io.to(`user:${userId}`).emit("notification:new");
        }

        res.json({ message: "Semana archivada", count: shifts.length });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al archivar semana" });
    }
});

// POST enviar horario semanal por email a todos los operadores (admin/lead)
router.post("/send-schedule", requireAuth, requireRole("admin", "lead"), async (req, res) => {
    const { imageBase64, weekLabel } = req.body;
    if (!imageBase64 || !weekLabel) {
        return res.status(400).json({ message: "imageBase64 y weekLabel son requeridos" });
    }
    try {
        const operators = await prisma.user.findMany({
            where: { role: "operator", active: true },
            select: { name: true, email: true },
        });
        await sendWeeklyScheduleEmail({ operators, imageBase64, weekLabel });
        res.json({ message: `Horario enviado a ${operators.length} operador${operators.length !== 1 ? "es" : ""}` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al enviar el horario" });
    }
});

export default router;
