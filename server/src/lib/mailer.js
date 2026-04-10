import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
    },
});

/**
 * Envía un correo al operador cuando su turno es aprobado o rechazado.
 */
export async function sendShiftResultEmail({ to, name, shiftTitle, shiftDate, status, notes }) {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
        console.log("[Mailer] GMAIL_USER/GMAIL_PASS no configurados, omitiendo email.");
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
        await transporter.sendMail({
            from: `"SLC Turnos" <${process.env.GMAIL_USER}>`,
            to,
            subject,
            html,
        });
        console.log(`[Mailer] Email enviado a ${to}`);
    } catch (err) {
        console.error("[Mailer] Error al enviar email:", err.message);
    }
}
