import "dotenv/config";
import { PrismaClient } from "../../generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,                    // máx conexiones simultáneas (Neon free = límite bajo)
    idleTimeoutMillis: 30_000, // cierra conexiones inactivas después de 30s
    connectionTimeoutMillis: 5_000, // falla rápido si no hay conexión disponible
});

const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });