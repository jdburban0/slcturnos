import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "./lib/prisma.js";

const ADMIN_PASSWORD   = process.env.SEED_ADMIN_PASSWORD   ?? "slc2025";
const OPERATOR_CODE    = process.env.SEED_OPERATOR_CODE    ?? "SLC2025";
const ADMIN_CODE       = process.env.SEED_ADMIN_CODE       ?? "SLCADMIN2025";

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

    await prisma.setting.upsert({
        where: { key: "register_code" },
        update: {},
        create: { key: "register_code", value: OPERATOR_CODE },
    });
    await prisma.setting.upsert({
        where: { key: "admin_register_code" },
        update: {},
        create: { key: "admin_register_code", value: ADMIN_CODE },
    });
    console.log(`✓ Código operadores: ${OPERATOR_CODE}`);
    console.log(`✓ Código admins:     ${ADMIN_CODE}`);

    console.log("\n✅ Seed completado.");
    console.log("   Admin: admin@slc.com");
    console.log("   Lead:  lead@slc.com");
    console.log("   (Contraseña y códigos definidos en .env)");
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
