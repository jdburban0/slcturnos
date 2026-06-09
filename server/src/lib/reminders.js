import cron from "node-cron";
import { prisma } from "./prisma.js";
import { sendPushToUser } from "./pushService.js";
import { sendShiftReminderEmail } from "./mailer.js";

async function sendTomorrowReminders() {
    console.log("[Reminder] Ejecutando recordatorios de turno para mañana...");

    // "Mañana" en Colombia = día calendario actual en UTC + 1
    // El cron dispara a las 8pm COT; usando timezone: "America/Bogota" en node-cron,
    // el proceso corre en la hora local del servidor pero con el schedule en COT.
    // Para calcular "mañana en Colombia" sumamos 1 día a la fecha actual en COT.
    const nowCOT = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
    const tomorrowCOT = new Date(nowCOT);
    tomorrowCOT.setDate(nowCOT.getDate() + 1);

    // Los turnos se guardan con date = YYYY-MM-DDT12:00:00 UTC
    // Buscamos cualquier turno cuyo date caiga en el día de mañana COT (que coincide con el día UTC)
    const y = tomorrowCOT.getFullYear();
    const m = tomorrowCOT.getMonth();
    const d = tomorrowCOT.getDate();
    const dayStart = new Date(y, m, d, 0, 0, 0, 0);         // 00:00 local (UTC en Render)
    const dayEnd   = new Date(y, m, d, 23, 59, 59, 999);     // 23:59 local

    try {
        const shifts = await prisma.shift.findMany({
            where: {
                date:   { gte: dayStart, lte: dayEnd },
                status: { not: "CLOSED" },
            },
            include: {
                requests: {
                    where: { status: "APPROVED" },
                    include: { user: { select: { id: true, name: true, email: true } } },
                },
                manualAssignments: true,
            },
        });

        if (!shifts.length) {
            console.log("[Reminder] No hay turnos para mañana.");
            return;
        }

        console.log(`[Reminder] ${shifts.length} turno(s) para mañana.`);

        for (const shift of shifts) {
            const shiftDateStr = new Date(shift.date).toLocaleDateString("es-CO", {
                weekday: "long", year: "numeric", month: "long", day: "numeric",
                timeZone: "America/Bogota",
            });

            // Recolectar destinatarios únicos (email → { name, userId })
            const recipients = new Map();

            for (const req of shift.requests) {
                recipients.set(req.user.email, { name: req.user.name, userId: req.user.id });
            }

            for (const ma of shift.manualAssignments) {
                if (!recipients.has(ma.email)) {
                    // Intentar encontrar userId por email para el push
                    const user = await prisma.user.findUnique({
                        where: { email: ma.email },
                        select: { id: true },
                    }).catch(() => null);
                    recipients.set(ma.email, { name: ma.name, userId: user?.id ?? null });
                }
            }

            for (const [email, { name, userId }] of recipients) {
                // Push notification
                if (userId) {
                    sendPushToUser(
                        userId,
                        "Recordatorio de turno",
                        `Tienes el turno "${shift.title}" mañana de ${shift.startTime} a ${shift.endTime}`
                    ).catch(() => {});
                }

                // Email
                sendShiftReminderEmail({
                    name, email,
                    shiftTitle: shift.title,
                    shiftDate: shiftDateStr,
                    startTime: shift.startTime,
                    endTime: shift.endTime,
                }).catch(() => {});
            }

            console.log(`[Reminder] ${recipients.size} recordatorio(s) para turno "${shift.title}"`);
        }
    } catch (err) {
        console.error("[Reminder] Error ejecutando recordatorios:", err.message);
    }
}

export function startReminders() {
    // Todos los días a las 8:00pm hora Colombia
    cron.schedule("0 20 * * *", sendTomorrowReminders, { timezone: "America/Bogota" });
    console.log("[Reminder] Cron de recordatorios iniciado (20:00 COT diario)");
}
