import webpush from "web-push";
import { prisma } from "./prisma.js";

webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL || "admin@slcturnos.com"}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

/**
 * Envía una push notification a todas las suscripciones activas de un usuario.
 * Si una suscripción ya no es válida (410 Gone), la elimina automáticamente.
 */
export async function sendPushToUser(userId, title, body) {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
        console.warn("[Push] VAPID keys no configuradas");
        return;
    }

    let subscriptions;
    try {
        subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
    } catch (err) {
        console.error("[Push] Error buscando suscripciones:", err.message);
        return;
    }

    console.log(`[Push] userId=${userId} subs=${subscriptions.length} title="${title}"`);
    if (!subscriptions.length) return;

    const payload = JSON.stringify({ title, body });

    await Promise.allSettled(
        subscriptions.map(async (sub) => {
            try {
                await webpush.sendNotification(
                    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                    payload
                );
                console.log(`[Push] ✓ Enviado a ${sub.endpoint.slice(0, 60)}...`);
            } catch (err) {
                console.error(`[Push] ✗ Error enviando (${err.statusCode}):`, err.message);
                if (err.statusCode === 404 || err.statusCode === 410) {
                    await prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } }).catch(() => {});
                    console.log("[Push] Suscripción expirada eliminada");
                }
            }
        })
    );
}

/**
 * Envía una push notification a todos los admins/leads activos con suscripción.
 */
export async function sendPushToAdmins(title, body) {
    let admins;
    try {
        admins = await prisma.user.findMany({
            where: { role: { in: ["admin", "lead"] }, active: true },
            select: { id: true },
        });
    } catch (err) {
        console.error("[Push] Error buscando admins:", err.message);
        return;
    }
    await Promise.allSettled(admins.map(({ id }) => sendPushToUser(id, title, body)));
}

// ─── Debounce push para solicitudes de turno (anti-spam) ─────────────────────
const ADMIN_REQ_PUSH_DEBOUNCE_MS = 60_000; // 1 minuto
const _adminReqPush = { timer: null };

/**
 * Encola una push para admins sobre solicitudes pendientes.
 * Si llegan varias en el mismo minuto se agrupan en una sola notificación.
 */
export function queueAdminRequestPush() {
    if (_adminReqPush.timer) clearTimeout(_adminReqPush.timer);
    _adminReqPush.timer = setTimeout(async () => {
        _adminReqPush.timer = null;
        try {
            const count = await prisma.shiftRequest.count({ where: { status: "PENDING" } });
            if (count === 0) return;
            const title = `${count} solicitud${count !== 1 ? "es" : ""} pendiente${count !== 1 ? "s" : ""}`;
            await sendPushToAdmins(title, "Hay solicitudes de turno esperando revisión.");
        } catch (err) {
            console.error("[Push] Error en queueAdminRequestPush:", err.message);
        }
    }, ADMIN_REQ_PUSH_DEBOUNCE_MS);
}
