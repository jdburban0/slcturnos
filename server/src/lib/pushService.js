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
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;

    let subscriptions;
    try {
        subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
    } catch {
        return;
    }

    if (!subscriptions.length) return;

    const payload = JSON.stringify({ title, body });

    await Promise.allSettled(
        subscriptions.map(async (sub) => {
            try {
                await webpush.sendNotification(
                    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                    payload
                );
            } catch (err) {
                // 404 o 410 = suscripción expirada, eliminar
                if (err.statusCode === 404 || err.statusCode === 410) {
                    await prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } }).catch(() => {});
                }
            }
        })
    );
}
