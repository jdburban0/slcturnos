import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "./lib/prisma.js";

const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) {
    console.error("❌ Falta la variable de entorno del seed. Define en .env:\n   SEED_ADMIN_PASSWORD");
    process.exit(1);
}

async function main() {
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);

    const users = [
        { name: "Administrador SLC", email: "admin@slc.com", role: "admin" },
        { name: "Lead Supervisor", email: "lead@slc.com", role: "lead" },
    ];

    for (const u of users) {
        await prisma.user.upsert({
            where: { email: u.email },
            update: {},
            create: { name: u.name, email: u.email, passwordHash: hash, role: u.role },
        });
        console.log(`✓ ${u.name} (${u.role})`);
    }

    console.log("\n✅ Seed completado.");
    console.log("   Admin: admin@slc.com");
    console.log("   Lead:  lead@slc.com");
    console.log("   (Contraseña definida en .env; nuevos usuarios se invitan desde el panel)");
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
