import { prisma } from "./prisma.js";
import { sendPushToUser } from "./pushService.js";

/**
 * Crea una notificación en DB, emite el socket y envía push notification.
 */
export async function notifyUser(io, userId, title, message) {
    const notification = await prisma.notification.create({
        data: { userId, title, message },
    });
    if (io) io.to(`user:${userId}`).emit("notification:new", notification);
    sendPushToUser(userId, title, message).catch(() => {});
    return notification;
}

/**
 * Crea múltiples notificaciones, emite sockets y envía pushes.
 */
export async function notifyMany(io, notifications) {
    if (!notifications.length) return;
    await prisma.notification.createMany({ data: notifications });
    for (const { userId, title, message } of notifications) {
        if (io) io.to(`user:${userId}`).emit("notification:new");
        sendPushToUser(userId, title, message).catch(() => {});
    }
}
