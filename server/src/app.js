import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRouter from "./routes/auth.js";
import shiftsRouter from "./routes/shifts.js";
import requestsRouter from "./routes/requests.js";
import notificationsRouter from "./routes/notifications.js";
import usersRouter from "./routes/users.js";
import settingsRouter from "./routes/settings.js";
import transfersRouter from "./routes/transfers.js";

dotenv.config();

const app = express();

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

app.use("/api/auth", authRouter);
app.use("/api/shifts", shiftsRouter);
app.use("/api/requests", requestsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/users", usersRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/transfers", transfersRouter);

export default app;
