import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "SLC Turnos <onboarding@resend.dev>";

/**
 * Envía un correo al operador cuando su turno es aprobado o rechazado.
 */
export async function sendShiftResultEmail({ to, name, shiftTitle, shiftDate, status, notes }) {
    if (!process.env.RESEND_API_KEY) {
        console.log("[Mailer] RESEND_API_KEY no configurado, omitiendo email.");
        return;
    }

    const approved = status === "APPROVED";
    const subject = approved
        ? `✅ Tu turno fue aprobado — ${shiftTitle}`
        : `❌ Tu turno fue rechazado — ${shiftTitle}`;

    const html = `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:12px;">
            <h2 style="color:#0f172a;margin:0 0 8px;">
                ${approved ? "✅ Turno aprobado" : "❌ Turno rechazado"}
            </h2>
            <p style="color:#475569;margin:0 0 20px;">Hola <strong>${name}</strong>, tu solicitud de turno ha sido revisada.</p>

            <div style="background:#ffffff;border-radius:8px;padding:16px;border:1px solid #e2e8f0;margin-bottom:20px;">
                <p style="margin:0 0 6px;color:#64748b;font-size:0.85rem;">TURNO</p>
                <p style="margin:0 0 4px;font-weight:700;color:#0f172a;">${shiftTitle}</p>
                <p style="margin:0;color:#475569;font-size:0.9rem;">📅 ${shiftDate}</p>
            </div>

            <div style="background:${approved ? "#f0fdf4" : "#fef2f2"};border-radius:8px;padding:14px;border:1px solid ${approved ? "#bbf7d0" : "#fecaca"};">
                <p style="margin:0;font-weight:700;color:${approved ? "#15803d" : "#b91c1c"};">
                    ${approved ? "¡Tu solicitud fue aprobada! Recuerda presentarte a tiempo." : "Tu solicitud no fue aprobada esta vez."}
                </p>
                ${notes ? `<p style="margin:8px 0 0;color:#374151;font-size:0.88rem;">Nota: ${notes}</p>` : ""}
            </div>

            <p style="color:#94a3b8;font-size:0.78rem;margin:20px 0 0;">— SLC Turnos</p>
        </div>
    `;

    try {
        await resend.emails.send({ from: FROM, to, subject, html });
        console.log(`[Mailer] Email enviado a ${to}`);
    } catch (err) {
        console.error("[Mailer] Error al enviar email:", err.message);
    }
}

/**
 * Envía el horario semanal como imagen adjunta a todos los operadores activos.
 */
export async function sendWeeklyScheduleEmail({ operators, imageBase64, weekLabel }) {
    if (!process.env.RESEND_API_KEY || !operators.length) return;

    const subject = `📅 Horario de turnos — ${weekLabel}`;

    for (const op of operators) {
        const html = `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:12px;">
                <h2 style="color:#0f172a;margin:0 0 8px;">📅 Horario de turnos</h2>
                <p style="color:#475569;margin:0 0 20px;">Hola <strong>${op.name}</strong>, aquí está el horario de turnos disponibles para <strong>${weekLabel}</strong>.</p>
                <img src="cid:schedule" style="width:100%;border-radius:8px;border:1px solid #e2e8f0;" alt="Horario de turnos" />
                <p style="color:#94a3b8;font-size:0.78rem;margin:20px 0 0;">— SLC Turnos</p>
            </div>
        `;

        try {
            await resend.emails.send({
                from: FROM,
                to: op.email,
                subject,
                html,
                attachments: [{
                    filename: `horario-${weekLabel}.jpg`,
                    content: Buffer.from(imageBase64, "base64"),
                }],
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
            await resend.emails.send({ from: FROM, to: op.email, subject, html });
            console.log(`[Mailer] Nuevo cupo notificado a ${op.email}`);
        } catch (err) {
            console.error(`[Mailer] Error al notificar a ${op.email}:`, err.message);
        }
    }
}
