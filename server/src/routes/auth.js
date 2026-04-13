import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { sendPasswordResetEmail } from "../lib/mailer.js";

const router = Router();
const SECRET = process.env.JWT_SECRET || "slc_dev_secret_change_in_prod";

function signToken(user) {
    return jwt.sign(
        { id: user.id, name: user.name, email: user.email, role: user.role },
        SECRET,
        { expiresIn: "8h" }
    );
}

router.post("/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: "Correo y contraseña requeridos" });
    }

    try {
        const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
        if (!user || !user.active) {
            return res.status(401).json({ message: "Credenciales inválidas" });
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
            return res.status(401).json({ message: "Credenciales inválidas" });
        }

        res.json({
            token: signToken(user),
            user: { id: user.id, name: user.name, email: user.email, role: user.role },
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error del servidor" });
    }
});

router.post("/register", async (req, res) => {
    const { name, email, password, code, group } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({ message: "El nombre es requerido" });
    }
    if (!email || !email.trim()) {
        return res.status(400).json({ message: "El correo es requerido" });
    }
    if (!email.toLowerCase().trim().endsWith("@sig.systems")) {
        return res.status(400).json({ message: "Solo se permiten correos @sig.systems" });
    }
    if (!password || password.length < 6) {
        return res.status(400).json({ message: "La contraseña debe tener al menos 6 caracteres" });
    }
    if (!code || !code.trim()) {
        return res.status(400).json({ message: "El código de acceso es requerido" });
    }

    try {
        const [operatorSetting, adminSetting] = await Promise.all([
            prisma.setting.findUnique({ where: { key: "register_code" } }),
            prisma.setting.findUnique({ where: { key: "admin_register_code" } }),
        ]);

        const isAdminCode = adminSetting && code.trim() === adminSetting.value;
        const isOperatorCode = operatorSetting && code.trim() === operatorSetting.value;

        if (!isAdminCode && !isOperatorCode) {
            return res.status(403).json({ message: "Código de acceso incorrecto" });
        }

        const role = isAdminCode ? "admin" : "operator";

        if (role === "operator" && !group) {
            return res.status(400).json({ message: "Debes seleccionar tu grupo (E1 o E2)" });
        }
        if (group && group !== "E1" && group !== "E2") {
            return res.status(400).json({ message: "Grupo inválido" });
        }

        const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
        if (existing) {
            return res.status(409).json({ message: "Ya existe una cuenta con ese correo" });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: {
                name: name.trim(),
                email: email.toLowerCase().trim(),
                passwordHash,
                role,
                ...(role === "operator" && group && { group }),
            },
        });

        res.status(201).json({
            token: signToken(user),
            user: { id: user.id, name: user.name, email: user.email, role: user.role },
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error del servidor" });
    }
});

router.patch("/change-password", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: "No autorizado" });

    const token = authHeader.split(" ")[1];
    let payload;
    try {
        payload = jwt.verify(token, SECRET);
    } catch {
        return res.status(401).json({ message: "Token inválido" });
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Faltan campos requeridos" });
    }
    if (newPassword.length < 6) {
        return res.status(400).json({ message: "La nueva contraseña debe tener al menos 6 caracteres" });
    }

    try {
        const user = await prisma.user.findUnique({ where: { id: payload.id } });
        if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

        const valid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!valid) return res.status(401).json({ message: "Contraseña actual incorrecta" });

        const passwordHash = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

        res.json({ message: "Contraseña actualizada correctamente" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error del servidor" });
    }
});

router.post("/forgot-password", async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ message: "El correo es requerido" });
    }

    try {
        const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

        if (user) {
            const code = String(Math.floor(100000 + Math.random() * 900000));

            await prisma.passwordResetToken.deleteMany({ where: { email: email.toLowerCase() } });
            await prisma.passwordResetToken.create({
                data: {
                    email: email.toLowerCase(),
                    code,
                    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
                },
            });

            await sendPasswordResetEmail({ email: email.toLowerCase(), name: user.name, code });
        }

        res.json({ message: "Si el correo existe, recibirás un código" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error del servidor" });
    }
});

router.post("/reset-password", async (req, res) => {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
        return res.status(400).json({ message: "Faltan campos requeridos" });
    }
    if (newPassword.length < 6) {
        return res.status(400).json({ message: "La nueva contraseña debe tener al menos 6 caracteres" });
    }

    try {
        const token = await prisma.passwordResetToken.findFirst({
            where: {
                email: email.toLowerCase(),
                code,
                used: false,
                expiresAt: { gt: new Date() },
            },
        });

        if (!token) {
            return res.status(400).json({ message: "Código inválido o expirado" });
        }

        const passwordHash = await bcrypt.hash(newPassword, 10);

        await prisma.$transaction([
            prisma.passwordResetToken.update({
                where: { id: token.id },
                data: { used: true },
            }),
            prisma.user.update({
                where: { email: email.toLowerCase() },
                data: { passwordHash },
            }),
        ]);

        res.json({ message: "Contraseña actualizada" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error del servidor" });
    }
});

export default router;
