import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import { prisma } from "./lib/prisma.js";
import app from "./app.js";
import { verifySocketToken } from "./middleware/auth.js";

const PORT = process.env.PORT || 4000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

const httpServer = createServer(app);

const io = new SocketServer(httpServer, {
    cors: { origin: CLIENT_URL, credentials: true },
});

// Make io available to route handlers
app.set("io", io);

// Authenticate socket connections
io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Unauthorized"));
    try {
        socket.user = verifySocketToken(token);
        next();
    } catch {
        next(new Error("Invalid token"));
    }
});

io.on("connection", (socket) => {
    const { id, name, role } = socket.user;
    socket.join(`user:${id}`);
    if (role === "admin" || role === "lead") {
        socket.join("admins");
    }
    console.log(`[WS] ${name} (${role}) connected`);

    socket.on("disconnect", () => {
        console.log(`[WS] ${name} disconnected`);
    });
});


// Warm up DB connection and ensure default settings exist
prisma.$queryRaw`SELECT 1`
    .then(async () => {
        console.log("[DB] Conexión lista");
        await prisma.setting.upsert({
            where: { key: "admin_register_code" },
            update: {},
            create: { key: "admin_register_code", value: "SLCADMIN2025" },
        });
    })
    .catch((err) => console.error("[DB] Error warmup:", err.message));


httpServer.listen(PORT, () => {
    console.log(`Servidor SLC Turnos corriendo en http://localhost:${PORT}`);
});
