import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";

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
    const { name, email, password, code } = req.body;

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
        const setting = await prisma.setting.findUnique({ where: { key: "register_code" } });
        if (!setting || code.trim() !== setting.value) {
            return res.status(403).json({ message: "Código de acceso incorrecto" });
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
                role: "operator",
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

export default router;
