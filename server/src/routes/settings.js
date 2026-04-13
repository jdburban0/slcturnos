import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

// GET código de registro actual (solo admin)
router.get("/register-code", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const setting = await prisma.setting.findUnique({ where: { key: "register_code" } });
        res.json({ code: setting?.value ?? null });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al obtener la configuración" });
    }
});

// PATCH actualizar código de registro (solo admin)
router.patch("/register-code", requireAuth, requireRole("admin"), async (req, res) => {
    const { code } = req.body;
    if (!code || !code.trim()) {
        return res.status(400).json({ message: "El código no puede estar vacío" });
    }
    if (code.trim().length < 4) {
        return res.status(400).json({ message: "El código debe tener al menos 4 caracteres" });
    }
    try {
        await prisma.setting.upsert({
            where: { key: "register_code" },
            update: { value: code.trim() },
            create: { key: "register_code", value: code.trim() },
        });
        res.json({ message: "Código actualizado" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al actualizar el código" });
    }
});

// GET código de registro para admins
router.get("/admin-register-code", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const setting = await prisma.setting.findUnique({ where: { key: "admin_register_code" } });
        res.json({ code: setting?.value ?? null });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al obtener la configuración" });
    }
});

// PATCH actualizar código de registro para admins
router.patch("/admin-register-code", requireAuth, requireRole("admin"), async (req, res) => {
    const { code } = req.body;
    if (!code || !code.trim()) {
        return res.status(400).json({ message: "El código no puede estar vacío" });
    }
    if (code.trim().length < 4) {
        return res.status(400).json({ message: "El código debe tener al menos 4 caracteres" });
    }
    try {
        await prisma.setting.upsert({
            where: { key: "admin_register_code" },
            update: { value: code.trim() },
            create: { key: "admin_register_code", value: code.trim() },
        });
        res.json({ message: "Código actualizado" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al actualizar el código" });
    }
});

export default router;
