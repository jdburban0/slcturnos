import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { sendNewShiftEmail, sendWeeklyScheduleEmail, sendAssignmentEmail, sendAdminTransferAlertEmail } from "../lib/mailer.js";

const router = Router();

// GET all shifts with their requests
router.get("/", requireAuth, async (req, res) => {
    try {
        const shifts = await prisma.shift.findMany({
            orderBy: [{ date: "asc" }, { startTime: "asc" }],
            include: {
                requests: {
                    where: { status: { in: ["PENDING", "APPROVED"] } },
                    include: {
                        user: { select: { id: true, name: true } },
                        transfer: { select: { status: true } },
                    },
                },
                manualAssignments: { select: { id: true, name: true, email: true, createdAt: true } },
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
            const [approvedCount, manualCount] = await Promise.all([
                prisma.shiftRequest.count({ where: { shiftId: shift.id, status: "APPROVED" } }),
                prisma.manualAssignment.count({ where: { shiftId: shift.id } }),
            ]);
            if (approvedCount + manualCount < newSlots) {
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
                select: { id: true, name: true, email: true },
            }).then((operators) => {
                console.log(`[Mailer] Notificando nuevo cupo a ${operators.length} operadores: ${operators.map((o) => o.email).join(", ")}`);
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
                manualAssignments: { select: { id: true } },
            },
        });

        if (!shift) return res.status(404).json({ message: "Turno no encontrado" });
        if (shift.status !== "OPEN") {
            return res.status(400).json({ message: "Este turno ya no está disponible" });
        }

        const approvedCount = shift.requests.filter((r) => r.status === "APPROVED").length + shift.manualAssignments.length;
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

        // No DAY + NIGHT for the same day (pending or approved)
        const oppositeType = shift.type === "DAY" ? "NIGHT" : "DAY";
        const sameDayStart = new Date(shift.date);
        sameDayStart.setHours(0, 0, 0, 0);
        const sameDayEnd = new Date(shift.date);
        sameDayEnd.setHours(23, 59, 59, 999);

        const sameDayOpposite = await prisma.shiftRequest.findFirst({
            where: {
                userId,
                status: { in: ["PENDING", "APPROVED"] },
                shift: {
                    type: oppositeType,
                    date: { gte: sameDayStart, lte: sameDayEnd },
                },
            },
        });
        if (sameDayOpposite) {
            return res.status(400).json({
                message: `Ya tienes un turno ${oppositeType === "NIGHT" ? "nocturno" : "diurno"} activo para este día`,
            });
        }

        // También verificar asignaciones manuales del tipo opuesto el mismo día
        const reqUser = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
        const sameDayManual = await prisma.manualAssignment.findFirst({
            where: {
                email: reqUser.email,
                shift: {
                    type: oppositeType,
                    date: { gte: sameDayStart, lte: sameDayEnd },
                },
            },
        });
        if (sameDayManual) {
            return res.status(400).json({
                message: `Ya tienes un turno ${oppositeType === "NIGHT" ? "nocturno" : "diurno"} activo para este día`,
            });
        }

        // Business rules for DAY shifts
        if (shift.type === "DAY") {
            const user = await prisma.user.findUnique({ where: { id: userId }, select: { group: true } });

            // E1 operators cannot take DAY shifts on Monday or Saturday
            const shiftDay = new Date(shift.date).getDay();
            if (user.group === "E1" && (shiftDay === 1 || shiftDay === 6)) {
                const dayName = shiftDay === 1 ? "lunes" : "sábado";
                return res.status(400).json({ message: `Operadores E1 no pueden tomar turnos diurnos el ${dayName}` });
            }

            // No DAY shift if approved for NIGHT shift of previous day
            const prevDay = new Date(shift.date);
            prevDay.setDate(prevDay.getDate() - 1);
            const prevDayStart = new Date(prevDay);
            prevDayStart.setHours(0, 0, 0, 0);
            const prevDayEnd = new Date(prevDay);
            prevDayEnd.setHours(23, 59, 59, 999);

            const prevNightApproved = await prisma.shiftRequest.findFirst({
                where: {
                    userId,
                    status: { in: ["PENDING", "APPROVED"] },
                    shift: {
                        type: "NIGHT",
                        date: { gte: prevDayStart, lte: prevDayEnd },
                    },
                },
            });
            if (prevNightApproved) {
                return res.status(400).json({ message: "No puedes tomar un turno diurno si tienes un turno nocturno aprobado el día anterior" });
            }

            // También verificar asignaciones manuales de turno nocturno el día anterior
            const requestingUser = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
            const prevNightManual = await prisma.manualAssignment.findFirst({
                where: {
                    email: requestingUser.email,
                    shift: {
                        type: "NIGHT",
                        date: { gte: prevDayStart, lte: prevDayEnd },
                    },
                },
            });
            if (prevNightManual) {
                return res.status(400).json({ message: "No puedes tomar un turno diurno si tienes un turno nocturno aprobado el día anterior" });
            }
        }

        // No NIGHT shift if approved for DAY shift of the next day
        if (shift.type === "NIGHT") {
            const nextDay = new Date(shift.date);
            nextDay.setDate(nextDay.getDate() + 1);
            const nextDayStart = new Date(nextDay); nextDayStart.setHours(0, 0, 0, 0);
            const nextDayEnd = new Date(nextDay); nextDayEnd.setHours(23, 59, 59, 999);

            const nextDayApproved = await prisma.shiftRequest.findFirst({
                where: {
                    userId,
                    status: { in: ["PENDING", "APPROVED"] },
                    shift: { type: "DAY", date: { gte: nextDayStart, lte: nextDayEnd } },
                },
            });
            if (nextDayApproved) {
                return res.status(400).json({ message: "No puedes tomar un turno nocturno si tienes un turno diurno aprobado al día siguiente" });
            }

            const nightUser = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
            const nextDayManual = await prisma.manualAssignment.findFirst({
                where: {
                    email: nightUser.email,
                    shift: { type: "DAY", date: { gte: nextDayStart, lte: nextDayEnd } },
                },
            });
            if (nextDayManual) {
                return res.status(400).json({ message: "No puedes tomar un turno nocturno si tienes un turno diurno aprobado al día siguiente" });
            }
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

// POST asignar manualmente un operador fulltime a un turno (admin/lead)
router.post("/:id/assign", requireAuth, requireRole("admin", "lead"), async (req, res) => {
    const { id } = req.params;
    const { name, email } = req.body;

    if (!name || !email) {
        return res.status(400).json({ message: "Nombre y correo son requeridos" });
    }

    try {
        const shift = await prisma.shift.findUnique({
            where: { id },
            include: {
                requests: { where: { status: "APPROVED" } },
                manualAssignments: true,
            },
        });

        if (!shift) return res.status(404).json({ message: "Turno no encontrado" });
        if (shift.status === "CLOSED") return res.status(400).json({ message: "El turno está cerrado" });

        const occupiedSlots = shift.requests.length + shift.manualAssignments.length;
        if (occupiedSlots >= shift.totalSlots) {
            return res.status(400).json({ message: "No hay cupos disponibles en este turno" });
        }

        const assignment = await prisma.manualAssignment.create({
            data: { shiftId: id, name: name.trim(), email: email.trim(), assignedBy: req.user.id },
        });

        const newOccupied = occupiedSlots + 1;
        if (newOccupied >= shift.totalSlots) {
            await prisma.shift.update({ where: { id }, data: { status: "FULL" } });
        }

        const shiftDate = new Date(shift.date).toLocaleDateString("es-CO", {
            weekday: "long", year: "numeric", month: "long", day: "numeric",
        });

        sendAssignmentEmail({ name: name.trim(), email: email.trim(), shiftTitle: shift.title, shiftDate, startTime: shift.startTime, endTime: shift.endTime });

        const io = req.app.get("io");
        io.emit("shifts:refresh");

        res.status(201).json(assignment);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al asignar operador" });
    }
});

// POST solicitar desistimiento de asignación manual (requiere aprobación del admin)
router.post("/:id/assign/:assignmentId/withdraw", requireAuth, async (req, res) => {
    const { id: shiftId, assignmentId } = req.params;
    try {
        const assignment = await prisma.manualAssignment.findUnique({
            where: { id: assignmentId },
            include: { shift: true },
        });
        if (!assignment) return res.status(404).json({ message: "Asignación no encontrada" });

        const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { email: true, name: true } });
        if (assignment.email.toLowerCase() !== user.email.toLowerCase()) {
            return res.status(403).json({ message: "No puedes desistir de una asignación que no es tuya" });
        }

        const existing = await prisma.shiftTransfer.findFirst({
            where: { assignmentId, status: "PENDING" },
        });
        if (existing) return res.status(400).json({ message: "Ya tienes una solicitud de desistimiento pendiente para este turno" });

        const transfer = await prisma.shiftTransfer.create({
            data: { assignmentId, shiftId, fromUserId: req.user.id },
        });

        const shiftDate = new Date(assignment.shift.date).toLocaleDateString("es-CO", {
            weekday: "long", year: "numeric", month: "long", day: "numeric",
        });
        const admins = await prisma.user.findMany({
            where: { role: { in: ["admin", "lead"] }, active: true },
            select: { name: true, email: true },
        });
        sendAdminTransferAlertEmail({
            admins,
            operatorName: user.name,
            shiftTitle: assignment.shift.title,
            shiftDate,
            type: "desist",
        });

        const io = req.app.get("io");
        io.to("admins").emit("transfers:refresh");
        io.to("admins").emit("notification:new");

        res.status(201).json(transfer);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al solicitar desistimiento" });
    }
});

// POST solicitar traspaso de asignación manual (queda pendiente de aprobación del admin)
router.post("/:id/assign/:assignmentId/transfer", requireAuth, async (req, res) => {
    const { id: shiftId, assignmentId } = req.params;
    const { toName, toEmail } = req.body;
    if (!toName || !toEmail) return res.status(400).json({ message: "Nombre y correo del compañero son requeridos" });

    try {
        const assignment = await prisma.manualAssignment.findUnique({
            where: { id: assignmentId },
            include: { shift: true },
        });
        if (!assignment) return res.status(404).json({ message: "Asignación no encontrada" });

        const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { email: true, name: true } });
        if (assignment.email.toLowerCase() !== user.email.toLowerCase()) {
            return res.status(403).json({ message: "No puedes traspasar una asignación que no es tuya" });
        }

        // Verificar que no haya ya un traspaso pendiente para esta asignación
        const existing = await prisma.shiftTransfer.findFirst({
            where: { assignmentId, status: "PENDING" },
        });
        if (existing) return res.status(400).json({ message: "Ya tienes una solicitud de traspaso pendiente para este turno" });

        const transfer = await prisma.shiftTransfer.create({
            data: {
                assignmentId,
                shiftId,
                fromUserId: req.user.id,
                toName,
                toEmail,
            },
        });

        const shiftDate = new Date(assignment.shift.date).toLocaleDateString("es-CO", {
            weekday: "long", year: "numeric", month: "long", day: "numeric",
        });

        const admins = await prisma.user.findMany({
            where: { role: { in: ["admin", "lead"] }, active: true },
            select: { name: true, email: true },
        });
        sendAdminTransferAlertEmail({
            admins,
            operatorName: user.name,
            shiftTitle: assignment.shift.title,
            shiftDate,
            type: "transfer",
            toName,
        });

        const io = req.app.get("io");
        io.to("admins").emit("transfers:refresh");
        io.to("admins").emit("notification:new");

        res.status(201).json(transfer);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al solicitar traspaso" });
    }
});

// POST enviar horario semanal por email a todos los operadores (admin/lead)
router.post("/send-schedule", requireAuth, requireRole("admin", "lead"), async (req, res) => {
    const { imageBase64, weekLabel, customMessage, recipientIds } = req.body;
    if (!imageBase64 || !weekLabel) {
        return res.status(400).json({ message: "imageBase64 y weekLabel son requeridos" });
    }
    try {
        const where = { role: "operator", active: true };
        if (Array.isArray(recipientIds) && recipientIds.length > 0) {
            where.id = { in: recipientIds };
        }
        const operators = await prisma.user.findMany({ where, select: { name: true, email: true } });
        if (operators.length === 0) {
            return res.status(400).json({ message: "No hay operadores seleccionados" });
        }
        await sendWeeklyScheduleEmail({ operators, imageBase64, weekLabel, customMessage });
        res.json({ message: `Horario enviado a ${operators.length} operador${operators.length !== 1 ? "es" : ""}` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al enviar el horario" });
    }
});

export default router;
