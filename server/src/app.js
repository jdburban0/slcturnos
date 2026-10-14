import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { requireAuth, requireRole } from "./middleware/auth.js";
import { sendTomorrowReminders } from "./lib/reminders.js";
import authRouter from "./routes/auth.js";
import shiftsRouter from "./routes/shifts.js";
import requestsRouter from "./routes/requests.js";
import notificationsRouter from "./routes/notifications.js";
import usersRouter from "./routes/users.js";
import transfersRouter from "./routes/transfers.js";
import pushRouter from "./routes/push.js";
import chatRouter from "./routes/chat.js";
import passkeysRouter from "./routes/passkeys.js";
import invitationsRouter from "./routes/invitations.js";

dotenv.config();

const app = express();

// Render (y otros PaaS) corren detrás de un proxy; esto permite que
// express-rate-limit y req.ip usen la IP real del cliente.
app.set("trust proxy", 1);

const allowedOrigins = [
    process.env.CLIENT_URL || "http://localhost:5173",
    "http://localhost:5173",
];
app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
            callback(new Error("Not allowed by CORS"));
        },
        credentials: true,
    })
);
app.use(express.json({ limit: "5mb" }));

app.get("/", (req, res) => res.json({ ok: true }));
app.get("/api/ping", (req, res) => res.json({ ok: true }));
app.post("/api/trigger-reminders", requireAuth, requireRole("admin", "lead"), async (req, res) => {
    try {
        await sendTomorrowReminders();
        res.json({ ok: true, message: "Recordatorios enviados" });
    } catch (err) {
        res.status(500).json({ message: "Error al enviar recordatorios", error: err.message });
    }
});

app.use("/api/auth", authRouter);
app.use("/api/shifts", shiftsRouter);
app.use("/api/requests", requestsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/users", usersRouter);
app.use("/api/transfers", transfersRouter);
app.use("/api/push", pushRouter);
app.use("/api/chat", chatRouter);
app.use("/api/passkeys", passkeysRouter);
app.use("/api/invitations", invitationsRouter);

export default app;
