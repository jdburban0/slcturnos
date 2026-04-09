import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useSocket } from "../hooks/useSocket.js";
import { getShifts, requestShift, cancelRequest } from "../api/index.js";
import ShiftCard from "../components/ShiftCard.jsx";
import NotificationBell from "../components/NotificationBell.jsx";
import ScheduleTable from "../components/ScheduleTable.jsx";

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function groupByDay(shifts) {
    const map = new Map();
    for (const s of shifts) {
        const key = s.date.slice(0, 10);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(s);
    }
    // Ordena cada día: Diurno primero, luego Nocturno
    for (const [key, list] of map) {
        map.set(key, list.sort((a, b) => (a.type === "DAY" ? -1 : 1) - (b.type === "DAY" ? -1 : 1)));
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function dayLabel(isoDate) {
    const [y, m, d] = isoDate.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    if (date.getTime() === today.getTime()) return "Hoy";
    if (date.getTime() === tomorrow.getTime()) return "Mañana";
    return `${DAY_NAMES[date.getDay()]} ${d} de ${date.toLocaleString("es-CO", { month: "long" })}`;
}

function DashboardPage() {
    const navigate = useNavigate();
    const { user, token, logout } = useAuth();
    const [shifts, setShifts] = useState([]);
    const [shiftsUpdatedAt, setShiftsUpdatedAt] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [toast, setToast] = useState(null);
    const [notifSignal, setNotifSignal] = useState(0);
    const [leaving, setLeaving] = useState(false);

    const loadShifts = useCallback(async () => {
        try {
            const data = await getShifts(token);
            setShifts(data);
            setShiftsUpdatedAt(Date.now());
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => { loadShifts(); }, [loadShifts]);

    useSocket(token, {
        "shifts:refresh": () => loadShifts(),
        "notification:new": (notif) => {
            setNotifSignal((s) => s + 1);
            showToast(notif?.title || "Nueva notificación", notif?.message || "");
        },
    });

    function showToast(title, message) {
        setToast({ title, message });
        setTimeout(() => setToast(null), 5000);
    }

    async function handleRequest(shiftId) {
        try {
            await requestShift(token, shiftId);
            showToast("Solicitud enviada", "Tu solicitud está pendiente de revisión.");
            loadShifts();
        } catch (err) { showToast("Error", err.message); }
    }

    async function handleCancelRequest(requestId) {
        try {
            await cancelRequest(token, requestId);
            showToast("Solicitud cancelada", "");
            loadShifts();
        } catch (err) { showToast("Error", err.message); }
    }

    function getMyRequest(shift) {
        return shift.requests?.find((r) => r.user?.id === user?.id) ?? null;
    }

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const upcomingShifts = shifts.filter((s) => s.status !== "CLOSED" && new Date(s.date.slice(0,10)+"T12:00:00") >= today);
    const myApprovedShifts = upcomingShifts.filter((s) =>
        s.requests?.some((r) => r.user?.id === user?.id && r.status === "APPROVED")
    );
    const grouped = groupByDay(upcomingShifts);

    return (
        <div className={leaving ? "anim-fade-out" : "anim-fade-in"} style={styles.page}>
            {toast && (
                <div className="anim-slide-right" style={styles.toast}>
                    <strong>{toast.title}</strong>
                    {toast.message && <p style={styles.toastMsg}>{toast.message}</p>}
                </div>
            )}

            <div style={styles.container}>
                <header style={styles.header}>
                    <div>
                        <h1 style={styles.title}>SLC Turnos</h1>
                        <p style={styles.subtitle}>Bienvenido, {user?.name}</p>
                    </div>
                    <div style={styles.headerActions}>
                        <button style={styles.logoutButton} onClick={() => { setLeaving(true); setTimeout(() => { logout(); navigate("/login"); }, 320); }}>
                            Cerrar sesión
                        </button>
                        <NotificationBell token={token} refreshSignal={notifSignal} />
                    </div>
                </header>

                {myApprovedShifts.length > 0 && (
                    <section style={styles.approvedBanner}>
                        <span>✅</span>
                        <div>
                            <strong style={styles.bannerTitle}>Turnos confirmados esta semana</strong>
                            <p style={styles.bannerText}>{myApprovedShifts.map((s) => s.title).join("  ·  ")}</p>
                        </div>
                    </section>
                )}

                <ScheduleTable shifts={shifts.filter((s) => s.status !== "CLOSED")} updatedAt={shiftsUpdatedAt} />

                {loading && <p style={styles.info}>Cargando turnos...</p>}
                {error && <p style={styles.errorMsg}>{error}</p>}

                {!loading && upcomingShifts.length === 0 && (
                    <div style={styles.emptyState}>
                        <p style={styles.emptyIcon}>📋</p>
                        <p style={styles.emptyText}>No hay turnos disponibles esta semana.</p>
                        <p style={styles.emptySubtext}>El supervisor publicará los turnos pronto.</p>
                    </div>
                )}

                {grouped.map(([date, dayShifts]) => (
                    <div key={date} style={styles.dayGroup}>
                        <div style={styles.dayHeader}>
                            <span style={styles.dayLabel}>{dayLabel(date)}</span>
                            <span style={styles.dayCount}>{dayShifts.length} turno{dayShifts.length !== 1 ? "s" : ""}</span>
                        </div>
                        <div style={styles.list}>
                            {dayShifts.map((shift) => (
                                <ShiftCard
                                    key={shift.id}
                                    shift={shift}
                                    myRequest={getMyRequest(shift)}
                                    onRequest={handleRequest}
                                    onCancelRequest={handleCancelRequest}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

const styles = {
    page: {
        minHeight: "100vh",
        background: "linear-gradient(180deg, #0f172a 0%, #1e293b 100%)",
        fontFamily: "Arial, sans-serif",
        padding: "28px 20px",
    },
    container: { maxWidth: "860px", margin: "0 auto" },
    header: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "16px",
        marginBottom: "24px",
        flexWrap: "wrap",
    },
    title: { margin: 0, color: "#ffffff", fontSize: "1.6rem", fontWeight: "800" },
    subtitle: { margin: "4px 0 0", color: "#94a3b8", fontSize: "0.9rem" },
    headerActions: { display: "flex", gap: "10px", alignItems: "center" },
    logoutButton: {
        background: "#ef4444",
        color: "#fff",
        border: "none",
        padding: "9px 14px",
        borderRadius: "9px",
        cursor: "pointer",
        fontWeight: "bold",
        fontSize: "0.85rem",
    },
    approvedBanner: {
        display: "flex",
        alignItems: "center",
        gap: "12px",
        background: "rgba(22,163,74,0.15)",
        border: "1px solid rgba(22,163,74,0.35)",
        borderRadius: "12px",
        padding: "12px 16px",
        marginBottom: "20px",
        fontSize: "0.9rem",
    },
    bannerTitle: { color: "#86efac", display: "block" },
    bannerText: { margin: "2px 0 0", color: "#4ade80", fontSize: "0.82rem" },
    dayGroup: { marginBottom: "20px" },
    dayHeader: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "8px",
        paddingBottom: "6px",
        borderBottom: "1px solid rgba(255,255,255,0.1)",
    },
    dayLabel: {
        color: "#e2e8f0",
        fontWeight: "700",
        fontSize: "0.95rem",
        textTransform: "capitalize",
    },
    dayCount: {
        color: "#64748b",
        fontSize: "0.78rem",
    },
    list: { display: "flex", flexDirection: "column", gap: "8px" },
    info: { color: "#94a3b8", textAlign: "center", padding: "40px 0" },
    errorMsg: {
        background: "#fee2e2",
        color: "#991b1b",
        padding: "12px 16px",
        borderRadius: "10px",
        marginBottom: "16px",
    },
    emptyState: { textAlign: "center", padding: "60px 20px" },
    emptyIcon: { fontSize: "3rem", margin: "0 0 12px" },
    emptyText: { color: "#e2e8f0", fontSize: "1.1rem", margin: "0 0 6px" },
    emptySubtext: { color: "#64748b", fontSize: "0.9rem" },
    toast: {
        position: "fixed",
        bottom: "24px",
        right: "24px",
        background: "#1e293b",
        color: "#f1f5f9",
        padding: "14px 18px",
        borderRadius: "12px",
        boxShadow: "0 8px 30px rgba(0,0,0,0.3)",
        zIndex: 200,
        maxWidth: "320px",
        border: "1px solid #334155",
    },
    toastMsg: { margin: "4px 0 0", fontSize: "0.85rem", color: "#94a3b8" },
};

export default DashboardPage;
