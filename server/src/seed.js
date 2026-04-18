import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "./lib/prisma.js";

async function main() {
    const hash = await bcrypt.hash("slc2025", 10);

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
        create: { key: "register_code", value: "SLC2025" },
    });
    await prisma.setting.upsert({
        where: { key: "admin_register_code" },
        update: {},
        create: { key: "admin_register_code", value: "SLCADMIN2025" },
    });
    console.log("✓ Código operadores: SLC2025");
    console.log("✓ Código admins: SLCADMIN2025");

    console.log("\n✅ Seed completado. Contraseña: slc2025");
    console.log("   Admin: admin@slc.com");
    console.log("   Lead:  lead@slc.com");
    console.log("   Código operadores: SLC2025");
    console.log("   Código admins:     SLCADMIN2025");
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
