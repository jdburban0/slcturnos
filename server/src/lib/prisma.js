import "dotenv/config";
import { PrismaClient } from "../../generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

const baseClient = new PrismaClient({ adapter });

// $extends intercepta notification.create/createMany para enviar push automáticamente
// El import dinámico evita dependencia circular con pushService.js
export const prisma = baseClient.$extends({
    query: {
        notification: {
            async create({ args, query }) {
                const result = await query(args);
                import("./pushService.js").then(({ sendPushToUser }) => {
                    sendPushToUser(result.userId, result.title, result.message).catch(() => {});
                }).catch(() => {});
                return result;
            },
            async createMany({ args, query }) {
                const result = await query(args);
                if (Array.isArray(args.data)) {
                    import("./pushService.js").then(({ sendPushToUser }) => {
                        for (const n of args.data) {
                            if (n.userId) sendPushToUser(n.userId, n.title, n.message).catch(() => {});
                        }
                    }).catch(() => {});
                }
                return result;
            },
        },
    },
});