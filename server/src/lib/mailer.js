import { Resend } from "resend";

const FROM = "SLC Turnos <noreply@slcturnos.online>";

let _resend = null;
function getResend() {
    if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
    return _resend;
}

const pendingQueue = new Map();

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
            <div style="background:#ffffff;border-radius:8px;padding:14px;border:1px solid #bfdbfe;margin-bottom:10px;">
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
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#eef4ff;border-radius:12px;">
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
export async function sendAssignmentEmail({ name, email, shiftTitle, shiftDate, startTime, endTime }) {
    if (!process.env.RESEND_API_KEY) return;

    const html = `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#eef4ff;border-radius:12px;">
            <h2 style="color:#0f172a;margin:0 0 8px;">📋 Asignación de turno diurno</h2>
            <p style="color:#475569;margin:0 0 20px;">Hola <strong>${name}</strong>, has sido asignado al siguiente turno:</p>
            <div style="background:#ffffff;border-radius:8px;padding:16px;border:1px solid #bfdbfe;margin-bottom:20px;">
                <p style="margin:0 0 6px;font-weight:700;color:#0f172a;font-size:1rem;">${shiftTitle}</p>
                <p style="margin:0 0 4px;color:#475569;font-size:0.9rem;">📅 ${shiftDate}</p>
                <p style="margin:0;color:#475569;font-size:0.9rem;">🕐 ${startTime} – ${endTime}</p>
            </div>
            <p style="color:#94a3b8;font-size:0.78rem;margin:0;">— SLC Turnos</p>
        </div>
    `;

    try {
        await getResend().emails.send({
            from: FROM,
            to: email,
            subject: `📋 Asignación de turno — ${shiftTitle}`,
            html,
        });
        console.log(`[Mailer] Asignación enviada a ${email}`);
    } catch (err) {
        console.error("[Mailer] Error enviando asignación:", err.message);
    }
}

export async function sendWeeklyScheduleEmail({ operators, imageBase64, weekLabel, customMessage }) {
    if (!process.env.RESEND_API_KEY || !operators.length) return;

    const subject = `📅 Horario de turnos — ${weekLabel}`;

    const bodyMsg = customMessage || `aquí está el horario de turnos para la semana de ${weekLabel}.`;

    for (const op of operators) {
        const paragraphs = bodyMsg
            .replace(/\[nombre\]/gi, op.name)
            .split(/\n+/)
            .filter(Boolean)
            .map((p) => `<p style="margin:0 0 16px;font-size:1rem;color:#0f172a;line-height:1.6;">${p}</p>`)
            .join("");

        const html = `
            <div style="font-family:Arial,sans-serif;margin:0;padding:24px 20px;background:#ffffff;">
                ${paragraphs}
                <img src="data:image/jpeg;base64,${imageBase64}" width="800" style="width:100%;max-width:800px;height:auto;display:block;margin:8px 0 20px;border:1px solid #e2e8f0;" alt="Horario de turnos" />
                <p style="margin:0 0 12px;">
                    <a href="https://slcturnos.online" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 22px;border-radius:8px;font-weight:700;font-size:0.9rem;">Ir a SLC Turnos →</a>
                </p>
                <p style="color:#94a3b8;font-size:0.78rem;margin:0;">— SLC Turnos</p>
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

export async function sendPasswordResetEmail({ email, name, code }) {
    if (!process.env.RESEND_API_KEY) return;

    const html = `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:12px;">
            <h2 style="color:#0f172a;margin:0 0 8px;">🔑 Restablecer contraseña</h2>
            <p style="color:#475569;margin:0 0 20px;">Hola <strong>${name}</strong>, recibimos una solicitud para restablecer tu contraseña.</p>
            <div style="background:#ffffff;border-radius:8px;padding:24px;border:1px solid #e2e8f0;margin-bottom:20px;text-align:center;">
                <p style="margin:0 0 8px;color:#475569;font-size:0.9rem;">Tu código de verificación es:</p>
                <p style="margin:0;font-size:2.5rem;font-weight:700;letter-spacing:0.25em;color:#0f172a;">${code}</p>
            </div>
            <p style="color:#475569;font-size:0.9rem;margin:0 0 8px;">Usa este código para restablecer tu contraseña. Expira en 15 minutos.</p>
            <p style="color:#94a3b8;font-size:0.78rem;margin:16px 0 0;">Si no solicitaste esto, ignora este mensaje. — SLC Turnos</p>
        </div>
    `;

    try {
        await getResend().emails.send({
            from: FROM,
            to: email,
            subject: "Código para restablecer tu contraseña — SLC Turnos",
            html,
        });
        console.log(`[Mailer] Código de recuperación enviado a ${email}`);
    } catch (err) {
        console.error("[Mailer] Error enviando código de recuperación:", err.message);
    }
}

export async function sendAdminTransferAlertEmail({ admins, operatorName, shiftTitle, shiftDate, type, toName }) {
    if (!process.env.RESEND_API_KEY || !admins.length) return;

    const isTransfer = type === "transfer";
    const subject = isTransfer
        ? `Solicitud de traspaso — ${shiftTitle}`
        : `Solicitud de desistimiento — ${shiftTitle}`;

    for (const admin of admins) {
        const html = `
            <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:12px;">
                <h2 style="color:#0f172a;margin:0 0 8px;">${isTransfer ? "🔄 Solicitud de traspaso" : "⚠️ Solicitud de desistimiento"}</h2>
                <p style="color:#475569;margin:0 0 20px;">Hola <strong>${admin.name}</strong>, hay una solicitud pendiente que requiere tu revisión.</p>

                <div style="background:#ffffff;border-radius:8px;padding:16px;border:1px solid #e2e8f0;margin-bottom:20px;">
                    <p style="margin:0 0 6px;color:#0f172a;font-size:0.95rem;">👤 <strong>Operador:</strong> ${operatorName}</p>
                    <p style="margin:0 0 6px;color:#0f172a;font-size:0.95rem;">📋 <strong>Turno:</strong> ${shiftTitle}</p>
                    <p style="margin:0 0 6px;color:#0f172a;font-size:0.95rem;">📅 <strong>Fecha:</strong> ${shiftDate}</p>
                    ${isTransfer ? `<p style="margin:0;color:#0f172a;font-size:0.95rem;">➡️ <strong>Ceder a:</strong> ${toName}</p>` : ""}
                </div>

                <p style="color:#475569;font-size:0.9rem;">Ingresa a SLC Turnos para aprobar o rechazar la solicitud.</p>
                <p style="color:#94a3b8;font-size:0.78rem;margin:20px 0 0;">— SLC Turnos</p>
            </div>
        `;

        try {
            await getResend().emails.send({ from: FROM, to: admin.email, subject, html });
        } catch (err) {
            console.error(`[Mailer] Error al notificar admin ${admin.email}:`, err.message);
        }
    }
}
