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
