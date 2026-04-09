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

// Auto-expire PENDING requests past holdExpiresAt every 5 minutes
async function expireOldRequests() {
    try {
        const expired = await prisma.shiftRequest.updateMany({
            where: {
                status: "PENDING",
                holdExpiresAt: { lt: new Date() },
            },
            data: { status: "EXPIRED" },
        });
        if (expired.count > 0) {
            console.log(`[CRON] ${expired.count} solicitudes expiradas`);
            io.emit("shifts:refresh");
            io.to("admins").emit("requests:refresh");
        }
    } catch (err) {
        console.error("[CRON] Error expirando solicitudes:", err.message);
    }
}

setInterval(expireOldRequests, 5 * 60 * 1000);
expireOldRequests(); // Run on startup too

httpServer.listen(PORT, () => {
    console.log(`Servidor SLC Turnos corriendo en http://localhost:${PORT}`);
});
