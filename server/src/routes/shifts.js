import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { sendNewShiftEmail, sendWeeklyScheduleEmail, sendAssignmentEmail, sendAdminTransferAlertEmail, queueAdminPendingNotification } from "../lib/mailer.js";
import { notifyMany } from "../lib/notify.js";

const router = Router();

// GET all shifts with their requests
router.get("/", requireAuth, async (req, res) => {
    try {
        const isAdmin = ["admin", "lead"].includes(req.user.role);
        // Calcular rango de la semana actual
        const now = new Date();
        const dow = now.getDay();
        const diffToMon = dow === 0 ? -6 : 1 - dow;
        const cwMonday = new Date(now);
        cwMonday.setDate(now.getDate() + diffToMon);
        cwMonday.setHours(0, 0, 0, 0);
        const cwSunday = new Date(cwMonday);
        cwSunday.setDate(cwMonday.getDate() + 6);
        cwSunday.setHours(23, 59, 59, 999);

        // Operadores ven: turnos de la semana actual (todos) + turnos publicados + turnos CLOSED
        const where = isAdmin ? {} : {
            OR: [
                { date: { gte: cwMonday, lte: cwSunday } }, // semana actual completa, sin filtro
                { published: true },
                { status: "CLOSED" },
            ],
        };

        const shifts = await prisma.shift.findMany({
            where,
            orderBy: [{ date: "asc" }, { startTime: "asc" }],
            include: {
                requests: {
                    where: { status: { in: ["PENDING", "APPROVED"] } },
                    orderBy: { createdAt: "asc" },
                    include: {
                        user: { select: { id: true, name: true, email: true } },
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
        // Calcular el lunes de la semana del nuevo turno
        const shiftDate = new Date(date + "T12:00:00");
        const shiftDow = shiftDate.getDay();
        const shiftDaysFromMon = shiftDow === 0 ? 6 : shiftDow - 1;
        const shiftMonday = new Date(shiftDate);
        shiftMonday.setDate(shiftDate.getDate() - shiftDaysFromMon);
        shiftMonday.setHours(0, 0, 0, 0);

        // Verificar que no existan turnos activos en semanas ANTERIORES a la del nuevo turno
        const activeInPriorWeeks = await prisma.shift.count({
            where: {
                status: { in: ["OPEN", "FULL"] },
                date: { lt: shiftMonday },
            },
        });
        if (activeInPriorWeeks > 0) {
            return res.status(409).json({
                message: "Debes archivar la semana anterior antes de crear turnos para una semana nueva.",
            });
        }

        // Heredar el estado published de los otros turnos de esa semana
        const weekEnd = new Date(shiftMonday);
        weekEnd.setDate(shiftMonday.getDate() + 7);
        const sibling = await prisma.shift.findFirst({
            where: { date: { gte: shiftMonday, lt: weekEnd }, published: true },
            select: { published: true },
        });
        const inheritedPublished = !!sibling;

        // Verificar si ya existe un turno con el mismo horario y tipo
        const existingShift = await prisma.shift.findFirst({
            where: {
                date: shiftDate,
                startTime,
                endTime,
                type,
            }
        });

        let shift;

        if (existingShift) {
            // Ya existe: sumar los cupos nuevos al total actual
            const newTotalSlots = existingShift.totalSlots + parseInt(totalSlots);
            const added = parseInt(totalSlots);

            shift = await prisma.shift.update({
                where: { id: existingShift.id },
                data: {
                    totalSlots: newTotalSlots,
                    ...(existingShift.status === "FULL" ? { status: "OPEN" } : {}),
                },
                include: { requests: true },
            });

            // Notificar a operadores que hay cupos nuevos (igual que en el PATCH)
            prisma.user.findMany({
                where: { role: "operator", active: true },
                select: { id: true, name: true, email: true },
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
            }).catch((err) => console.error("[Mailer] Error notificando cupos nuevos:", err.message));
        } else {
            // No existe: crear el turno normalmente
            shift = await prisma.shift.create({
                data: {
                    title,
                    date: shiftDate,
                    startTime,
                    endTime,
                    type,
                    totalSlots: parseInt(totalSlots),
                    createdBy: req.user.id,
                    published: inheritedPublished,
                },
                include: { requests: true },
            });
        }

        const io = req.app.get("io");
        io.emit("shifts:refresh");

        // 200 si se actualizó un turno existente, 201 si se creó uno nuevo
        res.status(existingShift ? 200 : 201).json(shift);
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
// DELETE all CLOSED shifts for a given week (admin only)
router.delete("/week/:monday", requireAuth, requireRole("admin", "lead"), async (req, res) => {
    const { monday } = req.params;
    const monDate = new Date(monday + "T00:00:00");
    const sunDate = new Date(monday + "T00:00:00");
    sunDate.setDate(sunDate.getDate() + 6);
    sunDate.setHours(23, 59, 59, 999);

    try {
        const shifts = await prisma.shift.findMany({
            where: { status: "CLOSED", date: { gte: monDate, lte: sunDate } },
            select: { id: true },
        });
        const ids = shifts.map((s) => s.id);
        if (ids.length === 0) return res.json({ count: 0 });

        await prisma.shiftRequest.deleteMany({ where: { shiftId: { in: ids } } });
        await prisma.shiftTransfer.deleteMany({ where: { shiftId: { in: ids } } });
        const { count } = await prisma.shift.deleteMany({ where: { id: { in: ids } } });

        res.json({ count });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al eliminar semana" });
    }
});

router.delete("/:id", requireAuth, requireRole("admin", "lead"), async (req, res) => {
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
        await prisma.shiftRequest.deleteMany({ where: { shiftId: id } });
        await prisma.shift.delete({ where: { id } });

        const io = req.app.get("io");
        io.emit("shifts:refresh");
        if (affectedUserIds.length > 0) {
            await notifyMany(io, affectedUserIds.map((userId) => ({
                userId,
                title: "Turno cancelado",
                message: `El turno "${shift.title}" fue eliminado por el administrador.`,
            })));
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

        // Allow requests on CLOSED shifts only if they belong to the current week
        if (shift.status !== "OPEN") {
            const today = new Date();
            const dayOfWeek = today.getDay();
            const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            const monday = new Date(today); monday.setDate(today.getDate() + diff); monday.setHours(0, 0, 0, 0);
            const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23, 59, 59, 999);
            const shiftDate = new Date(shift.date);
            const isCurrentWeekClosed = shift.status === "CLOSED" && shiftDate >= monday && shiftDate <= sunday;
            if (!isCurrentWeekClosed) {
                return res.status(400).json({ message: "Este turno ya no está disponible" });
            }
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

            // E1 operators cannot take DAY shifts on Monday
            const shiftDay = new Date(shift.date).getDay();
            if (user.group === "E1" && shiftDay === 1) {
                return res.status(400).json({ message: `Operadores E1 no pueden tomar turnos diurnos el lunes` });
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
                const estado = prevNightApproved.status === "APPROVED" ? "aprobado" : "pendiente";
                return res.status(400).json({ message: `Tienes un turno nocturno ${estado} el día anterior` });
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
                return res.status(400).json({ message: "Tienes una asignación de turno nocturno el día anterior" });
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
                const estado = nextDayApproved.status === "APPROVED" ? "aprobado" : "pendiente";
                return res.status(400).json({ message: `Tienes un turno diurno ${estado} al día siguiente` });
            }

            const nightUser = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
            const nextDayManual = await prisma.manualAssignment.findFirst({
                where: {
                    email: nightUser.email,
                    shift: { type: "DAY", date: { gte: nextDayStart, lte: nextDayEnd } },
                },
            });
            if (nextDayManual) {
                return res.status(400).json({ message: "Tienes una asignación de turno diurno al día siguiente" });
            }
        }

        // Crear la solicitud dentro de una transacción con bloqueo para evitar race conditions
        const request = await prisma.$transaction(async (tx) => {
            // SELECT FOR UPDATE bloquea la fila del turno hasta que termine la transacción
            await tx.$executeRaw`SELECT id FROM "Shift" WHERE id = ${id} FOR UPDATE`;

            // Re-verificar dentro de la transacción si queda 1 solo cupo y ya hay pendiente de otro
            const freshShift = await tx.shift.findUnique({
                where: { id },
                include: {
                    requests: { where: { status: { in: ["PENDING", "APPROVED"] } } },
                    manualAssignments: { select: { id: true } },
                },
            });
            const freshApproved = freshShift.requests.filter((r) => r.status === "APPROVED").length + freshShift.manualAssignments.length;
            const freshAvailable = freshShift.totalSlots - freshApproved;
            if (freshAvailable === 1) {
                const otherPending = freshShift.requests.find((r) => r.status === "PENDING" && r.userId !== userId);
                if (otherPending) throw Object.assign(new Error("Ya hay una solicitud pendiente para este turno"), { status: 409 });
            }

            return tx.shiftRequest.create({
                data: { shiftId: id, userId },
                include: {
                    user: { select: { id: true, name: true } },
                    shift: true,
                },
            });
        });

        const io = req.app.get("io");
        io.to("admins").emit("requests:refresh");
        io.emit("shifts:refresh");

        // Notificar admins por correo solo si ninguno está conectado en este momento
        const adminRoom = io.sockets.adapter.rooms.get("admins");
        const adminsOnline = adminRoom ? adminRoom.size > 0 : false;
        if (!adminsOnline) {
            prisma.user.findMany({
                where: { role: { in: ["admin", "lead"] }, active: true },
                select: { name: true, email: true },
            }).then((admins) => queueAdminPendingNotification(admins)).catch(() => { });
        }

        res.status(201).json(request);
    } catch (err) {
        if (err.status === 409) return res.status(409).json({ message: err.message });
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

        // Close all shifts in the week
        await prisma.shift.updateMany({
            where: { id: { in: shifts.map((s) => s.id) } },
            data: { status: "CLOSED" },
        });

        const io = req.app.get("io");
        io.emit("shifts:refresh");
        if (affectedUserIds.length > 0) {
            await notifyMany(io, affectedUserIds.map((userId) => ({
                userId,
                title: "Semana archivada",
                message: `Los turnos de la semana del ${weekStart} fueron archivados por el supervisor.`,
            })));
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

        const occupiedSlots = shift.requests.length + shift.manualAssignments.length;
        if (occupiedSlots >= shift.totalSlots) {
            return res.status(400).json({ message: "No hay cupos disponibles en este turno" });
        }

        const assignment = await prisma.manualAssignment.create({
            data: { shiftId: id, name: name.trim(), email: email.trim(), assignedBy: req.user.id },
        });

        const newOccupied = occupiedSlots + 1;
        if (newOccupied >= shift.totalSlots && shift.status !== "CLOSED") {
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

        const cleanToEmail = toEmail.toLowerCase().trim();
        const [alreadyRequest, alreadyManual] = await Promise.all([
            prisma.shiftRequest.findFirst({
                where: { shiftId, status: "APPROVED", user: { email: cleanToEmail } },
            }),
            prisma.manualAssignment.findFirst({
                where: { shiftId, email: cleanToEmail },
            }),
        ]);
        if (alreadyRequest || alreadyManual) {
            return res.status(400).json({ message: "Ese compañero ya está asignado a este turno" });
        }

        const transfer = await prisma.shiftTransfer.create({
            data: {
                assignmentId,
                shiftId,
                fromUserId: req.user.id,
                toName,
                toEmail: cleanToEmail,
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

// DELETE /:id/assigned/:requestId — admin elimina a un operador aprobado del turno
router.delete("/:id/assigned/:requestId", requireAuth, requireRole("admin", "lead"), async (req, res) => {
    const { id: shiftId, requestId } = req.params;
    try {
        const request = await prisma.shiftRequest.findUnique({
            where: { id: requestId },
            include: { shift: true },
        });
        if (!request || request.shiftId !== shiftId) {
            return res.status(404).json({ message: "Solicitud no encontrada" });
        }
        if (request.status !== "APPROVED") {
            return res.status(400).json({ message: "La solicitud no está aprobada" });
        }

        await prisma.shiftRequest.update({
            where: { id: requestId },
            data: { status: "CANCELLED", reviewedBy: req.user.id, reviewedAt: new Date() },
        });

        // Eliminar cualquier solicitud de desistimiento/traspaso pendiente asociada
        await prisma.shiftTransfer.deleteMany({
            where: { requestId, status: "PENDING" },
        });

        // Si el turno estaba lleno, volver a abrirlo
        if (request.shift.status === "FULL") {
            await prisma.shift.update({ where: { id: shiftId }, data: { status: "OPEN" } });
        }

        const io = req.app.get("io");
        io.emit("shifts:refresh");
        io.to("admins").emit("requests:refresh");
        io.to("admins").emit("transfers:refresh");

        res.json({ message: "Operador eliminado del turno" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al eliminar operador del turno" });
    }
});

// DELETE /:id/manual/:assignmentId — admin elimina una asignación manual del turno
router.delete("/:id/manual/:assignmentId", requireAuth, requireRole("admin", "lead"), async (req, res) => {
    const { id: shiftId, assignmentId } = req.params;
    try {
        const assignment = await prisma.manualAssignment.findUnique({
            where: { id: assignmentId },
            include: { shift: true },
        });
        if (!assignment || assignment.shiftId !== shiftId) {
            return res.status(404).json({ message: "Asignación no encontrada" });
        }

        // Eliminar cualquier solicitud de desistimiento/traspaso pendiente asociada
        await prisma.shiftTransfer.deleteMany({
            where: { assignmentId, status: "PENDING" },
        });

        await prisma.manualAssignment.delete({ where: { id: assignmentId } });

        // Si el turno estaba lleno, volver a abrirlo
        if (assignment.shift.status === "FULL") {
            await prisma.shift.update({ where: { id: shiftId }, data: { status: "OPEN" } });
        }

        const io = req.app.get("io");
        io.emit("shifts:refresh");
        io.to("admins").emit("transfers:refresh");

        res.json({ message: "Asignación eliminada del turno" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al eliminar la asignación" });
    }
});

// PATCH /week/:monday/unarchive — restaurar turnos archivados de una semana
router.patch("/week/:monday/unarchive", requireAuth, requireRole("admin", "lead"), async (req, res) => {
    const { monday } = req.params;
    const weekStart = new Date(monday + "T00:00:00");
    const weekEnd = new Date(monday + "T00:00:00");
    weekEnd.setDate(weekEnd.getDate() + 7);

    try {
        // Solo permitir desarchivar si la semana aún no ha comenzado
        const today = new Date(); today.setHours(0, 0, 0, 0);
        if (weekStart <= today) {
            return res.status(400).json({ message: "Solo se pueden desarchivar semanas que aún no han comenzado" });
        }

        const closedShifts = await prisma.shift.findMany({
            where: { date: { gte: weekStart, lt: weekEnd }, status: "CLOSED" },
            include: {
                requests: { where: { status: "APPROVED" } },
                manualAssignments: true,
            },
        });

        if (closedShifts.length === 0) {
            return res.status(400).json({ message: "No hay turnos archivados en esa semana" });
        }

        // Restaurar cada turno al estado correcto según cupos ocupados
        await Promise.all(closedShifts.map((s) => {
            const occupied = s.requests.length + s.manualAssignments.length;
            const newStatus = occupied >= s.totalSlots ? "FULL" : "OPEN";
            return prisma.shift.update({ where: { id: s.id }, data: { status: newStatus } });
        }));

        const io = req.app.get("io");
        io.emit("shifts:refresh");

        res.json({ count: closedShifts.length });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al desarchivar semana" });
    }
});

// PATCH /week/:monday/publish — publicar o despublicar todos los turnos de una semana
router.patch("/week/:monday/publish", requireAuth, requireRole("admin", "lead"), async (req, res) => {
    const { monday } = req.params;
    const { published } = req.body;
    if (typeof published !== "boolean") {
        return res.status(400).json({ message: "El campo 'published' debe ser true o false" });
    }
    try {
        const weekStart = new Date(monday + "T00:00:00");
        const weekEnd = new Date(monday + "T00:00:00");
        weekEnd.setDate(weekEnd.getDate() + 7);

        const { count } = await prisma.shift.updateMany({
            where: { date: { gte: weekStart, lt: weekEnd }, status: { not: "CLOSED" } },
            data: { published },
        });

        const io = req.app.get("io");
        io.emit("shifts:refresh");

        res.json({ count, published });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al actualizar visibilidad" });
    }
});

export default router;
