import { Resend } from "resend";

const FROM = "SLC Turnos <noreply@slcturnos.online>";

let _resend = null;
function getResend() {
    if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
    return _resend;
}

// Cola de notificaciones pendientes por operador (debounce 15s)
const pendingQueue = new Map(); // userId -> { to, name, shifts: [], timer }

/**
 * Encola una notificación de resultado de turno.
 * Si llegan varias del mismo operador en 15s, se mandan todas en un solo email.
 */
export function queueShiftResultEmail({ userId, to, name, shiftTitle, shiftDate, status, notes }) {
    if (!process.env.RESEND_API_KEY) return;

    if (pendingQueue.has(userId)) {
        clearTimeout(pendingQueue.get(userId).timer);
        pendingQueue.get(userId).shifts.push({ shiftTitle, shiftDate, status, notes });
    } else {
        pendingQueue.set(userId, { to, name, shifts: [{ shiftTitle, shiftDate, status, notes }] });
    }

    const timer = setTimeout(async () => {
        const entry = pendingQueue.get(userId);
        pendingQueue.delete(userId);
        await flushShiftResultEmail(entry);
    }, 15000);

    pendingQueue.get(userId).timer = timer;
}

async function flushShiftResultEmail({ to, name, shifts }) {
    const single = shifts.length === 1;
    const allApproved = shifts.every((s) => s.status === "APPROVED");
    const allRejected = shifts.every((s) => s.status === "REJECTED");

    const subject = single
        ? (shifts[0].status === "APPROVED" ? `✅ Tu turno fue aprobado — ${shifts[0].shiftTitle}` : `❌ Tu turno fue rechazado — ${shifts[0].shiftTitle}`)
        : allApproved ? `✅ Tus ${shifts.length} turnos fueron aprobados`
        : allRejected ? `❌ Tus ${shifts.length} turnos fueron rechazados`
        : `📋 Resultado de tus solicitudes de turno`;

    const rows = shifts.map((s) => {
        const approved = s.status === "APPROVED";
        return `
            <div style="background:#ffffff;border-radius:8px;padding:14px;border:1px solid #e2e8f0;margin-bottom:10px;">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                    <div>
                        <p style="margin:0 0 2px;font-weight:700;color:#0f172a;font-size:0.9rem;">${s.shiftTitle}</p>
                        <p style="margin:0;color:#64748b;font-size:0.82rem;">📅 ${s.shiftDate}</p>
                        ${s.notes ? `<p style="margin:4px 0 0;color:#374151;font-size:0.82rem;">Nota: ${s.notes}</p>` : ""}
                    </div>
                    <span style="white-space:nowrap;font-weight:700;font-size:0.85rem;color:${approved ? "#15803d" : "#b91c1c"};">
                        ${approved ? "✅ Aprobado" : "❌ Rechazado"}
                    </span>
                </div>
            </div>
        `;
    }).join("");

    const html = `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:12px;">
            <h2 style="color:#0f172a;margin:0 0 8px;">📋 Resultado de tus solicitudes</h2>
            <p style="color:#475569;margin:0 0 20px;">Hola <strong>${name}</strong>, aquí está el resultado de tus solicitudes de turno.</p>
            ${rows}
            <p style="color:#94a3b8;font-size:0.78rem;margin:16px 0 0;">— SLC Turnos</p>
        </div>
    `;

    try {
        await getResend().emails.send({ from: FROM, to, subject, html });
        console.log(`[Mailer] Resultado enviado a ${to} (${shifts.length} turno${shifts.length !== 1 ? "s" : ""})`);
    } catch (err) {
        console.error("[Mailer] Error al enviar resultado:", err.message);
    }
}

/**
 * Envía el horario semanal como imagen adjunta a todos los operadores activos.
 */
export async function sendWeeklyScheduleEmail({ operators, imageBase64, weekLabel, customMessage }) {
    if (!process.env.RESEND_API_KEY || !operators.length) return;

    const subject = `📅 Horario de turnos — ${weekLabel}`;

    for (const op of operators) {
        const html = `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:12px;">
                <h2 style="color:#0f172a;margin:0 0 8px;">📅 Horario de turnos</h2>
                <p style="color:#475569;margin:0 0 ${customMessage ? "12px" : "20px"};">Hola <strong>${op.name}</strong>, aquí está el horario de turnos disponibles para <strong>${weekLabel}</strong>.</p>
                ${customMessage ? `<p style="color:#1e293b;background:#e2e8f0;border-radius:8px;padding:12px 16px;margin:0 0 20px;font-size:0.95rem;">${customMessage}</p>` : ""}
                <img src="data:image/jpeg;base64,${imageBase64}" style="width:100%;border-radius:8px;border:1px solid #e2e8f0;" alt="Horario de turnos" />
                <p style="color:#94a3b8;font-size:0.78rem;margin:20px 0 0;">— SLC Turnos</p>
            </div>
        `;

        try {
            await getResend().emails.send({
                from: FROM,
                to: op.email,
                subject,
                html,
            });
            console.log(`[Mailer] Horario enviado a ${op.email}`);
        } catch (err) {
            console.error(`[Mailer] Error enviando horario a ${op.email}:`, err.message);
        }
    }
}

/**
 * Notifica a todos los operadores activos que hay un nuevo cupo disponible.
 */
export async function sendNewShiftEmail({ operators, shiftTitle, shiftDate, startTime, endTime, totalSlots, extraMsg }) {
    if (!process.env.RESEND_API_KEY || !operators.length) return;

    const subject = `🆕 Nuevo cupo disponible — ${shiftTitle}`;

    for (const op of operators) {
        const html = `
            <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:12px;">
                <h2 style="color:#0f172a;margin:0 0 8px;">🆕 Nuevo cupo disponible</h2>
                <p style="color:#475569;margin:0 0 20px;">Hola <strong>${op.name}</strong>, hay un cupo disponible para solicitar.</p>

                <div style="background:#ffffff;border-radius:8px;padding:16px;border:1px solid #e2e8f0;margin-bottom:20px;">
                    <p style="margin:0 0 4px;font-weight:700;color:#0f172a;font-size:1rem;">${shiftTitle}</p>
                    <p style="margin:0 0 4px;color:#475569;font-size:0.9rem;">📅 ${shiftDate}</p>
                    <p style="margin:0 0 4px;color:#475569;font-size:0.9rem;">🕐 ${startTime} – ${endTime}</p>
                    <p style="margin:0;color:#475569;font-size:0.9rem;">👥 ${extraMsg || `${totalSlots} cupo${totalSlots !== 1 ? "s" : ""} disponible${totalSlots !== 1 ? "s" : ""}`}</p>
                </div>

                <p style="color:#94a3b8;font-size:0.78rem;margin:20px 0 0;">— SLC Turnos</p>
            </div>
        `;

        try {
            await getResend().emails.send({ from: FROM, to: op.email, subject, html });
            console.log(`[Mailer] Nuevo cupo notificado a ${op.email}`);
        } catch (err) {
            console.error(`[Mailer] Error al notificar a ${op.email}:`, err.message);
        }
    }
}
