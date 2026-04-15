import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

// GET active operators list (any authenticated user, for transfer modal)
router.get("/colleagues", requireAuth, async (req, res) => {
    try {
        const colleagues = await prisma.user.findMany({
            where: { role: "operator", active: true, NOT: { id: req.user.id } },
            select: { id: true, name: true, email: true },
            orderBy: { name: "asc" },
        });
        res.json(colleagues);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al obtener compañeros" });
    }
});

// GET all users (admin/lead)
router.get("/", requireAuth, requireRole("admin", "lead"), async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
            orderBy: { name: "asc" },
        });
        res.json(users);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al obtener usuarios" });
    }
});

// POST create user (admin only)
router.post("/", requireAuth, requireRole("admin"), async (req, res) => {
    const { name, email, password, role, group } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ message: "Nombre, correo y contraseña son requeridos" });
    }
    const assignedRole = role || "operator";
    if (assignedRole === "operator" && (!group || !["E1", "E2"].includes(group))) {
        return res.status(400).json({ message: "Los operadores deben tener grupo E1 o E2" });
    }

    try {
        const cleanEmail = email.toLowerCase().trim();
        const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
        if (existing) {
            return res.status(400).json({ message: "Ya existe un usuario con ese correo" });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: {
                name: name.trim(),
                email: cleanEmail,
                passwordHash,
                role: assignedRole,
                ...(assignedRole === "operator" && { group }),
            },
            select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
        });
        res.status(201).json(user);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al crear usuario" });
    }
});

// PATCH toggle user active status (admin/lead)
router.patch("/:id/toggle", requireAuth, requireRole("admin", "lead"), async (req, res) => {
    try {
        const current = await prisma.user.findUnique({ where: { id: req.params.id } });
        if (!current) return res.status(404).json({ message: "Usuario no encontrado" });

        const user = await prisma.user.update({
            where: { id: req.params.id },
            data: { active: !current.active },
            select: { id: true, name: true, email: true, role: true, active: true },
        });

        if (!user.active) {
            const io = req.app.get("io");
            io.to(`user:${user.id}`).emit("force:logout");
        }

        res.json(user);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al actualizar usuario" });
    }
});

// DELETE user and all associated data (admin only)
router.delete("/:id", requireAuth, requireRole("admin"), async (req, res) => {
    const { id } = req.params;

    // No permitir que el admin se elimine a sí mismo
    if (id === req.user.id) {
        return res.status(400).json({ message: "No puedes eliminar tu propia cuenta" });
    }

    try {
        const user = await prisma.user.findUnique({ where: { id } });
        if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

        await prisma.$transaction([
            prisma.notification.deleteMany({ where: { userId: id } }),
            prisma.shiftTransfer.deleteMany({ where: { fromUserId: id } }),
            prisma.shiftRequest.deleteMany({ where: { userId: id } }),
            prisma.user.delete({ where: { id } }),
        ]);

        res.json({ message: "Usuario eliminado" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error al eliminar usuario" });
    }
});

export default router;
