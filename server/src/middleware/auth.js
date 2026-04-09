import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET || "slc_dev_secret_change_in_prod";

export function verifySocketToken(token) {
    return jwt.verify(token, SECRET);
}

export function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ message: "No autorizado" });
    }
    const token = authHeader.slice(7);
    try {
        req.user = jwt.verify(token, SECRET);
        next();
    } catch {
        return res.status(401).json({ message: "Token inválido o expirado" });
    }
}

export function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ message: "Sin permisos suficientes" });
        }
        next();
    };
}
