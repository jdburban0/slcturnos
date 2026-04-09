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

// GET configuración de WhatsApp (solo admin)
router.get("/whatsapp", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const [phoneSetting, keySetting] = await Promise.all([
            prisma.setting.findUnique({ where: { key: "whatsapp_phone" } }),
            prisma.setting.findUnique({ where: { key: "whatsapp_apikey" } }),
        ]);
        res.json({ phone: phoneSetting?.value ?? "", apikey: keySetting?.value ?? "" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al obtener configuración de WhatsApp" });
    }
});

// PATCH configuración de WhatsApp (solo admin)
router.patch("/whatsapp", requireAuth, requireRole("admin"), async (req, res) => {
    const { phone, apikey } = req.body;
    if (!phone || !apikey) {
        return res.status(400).json({ message: "Teléfono y clave API son requeridos" });
    }
    try {
        await Promise.all([
            prisma.setting.upsert({
                where: { key: "whatsapp_phone" },
                update: { value: phone.trim() },
                create: { key: "whatsapp_phone", value: phone.trim() },
            }),
            prisma.setting.upsert({
                where: { key: "whatsapp_apikey" },
                update: { value: apikey.trim() },
                create: { key: "whatsapp_apikey", value: apikey.trim() },
            }),
        ]);
        res.json({ message: "Configuración de WhatsApp guardada" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al guardar configuración de WhatsApp" });
    }
});

export default router;
