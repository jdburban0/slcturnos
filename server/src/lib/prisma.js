import "dotenv/config";
import { PrismaClient } from "../../generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter });

// Envía push notification automáticamente cada vez que se crea una Notification
prisma.$use(async (params, next) => {
    const result = await next(params);

    if (params.model === "Notification") {
        // Import lazy para evitar dependencia circular
        const { sendPushToUser } = await import("./pushService.js");

        if (params.action === "create") {
            sendPushToUser(result.userId, result.title, result.message).catch(() => {});
        } else if (params.action === "createMany" && Array.isArray(params.args?.data)) {
            for (const n of params.args.data) {
                if (n.userId) sendPushToUser(n.userId, n.title, n.message).catch(() => {});
            }
        }
    }

    return result;
});