import { useState, useEffect, useRef } from "react";
import { getNotifications, markAllNotificationsRead, markNotificationRead } from "../api/index.js";

function NotificationBell({ token, refreshSignal }) {
    const [notifications, setNotifications] = useState([]);
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    const unread = notifications.filter((n) => !n.isRead).length;

    async function load() {
        try {
            const data = await getNotifications(token);
            setNotifications(data);
        } catch {
            // silent
        }
    }

    useEffect(() => {
        load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, refreshSignal]);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClick(e) {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    async function handleMarkAll() {
        try {
            await markAllNotificationsRead(token);
            setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        } catch {
            // silent
        }
    }

    async function handleMarkOne(id) {
        try {
            await markNotificationRead(token, id);
            setNotifications((prev) =>
                prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
            );
        } catch {
            // silent
        }
    }

    return (
        <div ref={ref} style={styles.wrapper}>
            <button style={styles.bellBtn} onClick={() => setOpen((o) => !o)}>
                🔔
                {unread > 0 && <span style={styles.badge}>{unread}</span>}
            </button>

            {open && (
                <div style={styles.dropdown} className="notif-dropdown">
                    <div style={styles.dropHeader}>
                        <span style={styles.dropTitle}>Notificaciones</span>
                        {unread > 0 && (
                            <button style={styles.markAllBtn} onClick={handleMarkAll}>
                                Marcar todas
                            </button>
                        )}
                    </div>

                    <div style={styles.list}>
                        {notifications.length === 0 && (
                            <p style={styles.empty}>No hay notificaciones</p>
                        )}
                        {notifications.map((n) => (
                            <div
                                key={n.id}
                                style={{ ...styles.item, ...(n.isRead ? {} : styles.itemUnread) }}
                                onClick={() => !n.isRead && handleMarkOne(n.id)}
                            >
                                <p style={styles.itemTitle}>{n.title}</p>
                                <p style={styles.itemMsg}>{n.message}</p>
                                <p style={styles.itemTime}>
                                    {new Date(n.createdAt).toLocaleString("es-CO", {
                                        month: "short",
                                        day: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                    })}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

const styles = {
    wrapper: { position: "relative" },
    bellBtn: {
        position: "relative",
        background: "rgba(255,255,255,0.1)",
        border: "1px solid rgba(255,255,255,0.2)",
        borderRadius: "10px",
        padding: "8px 12px",
        cursor: "pointer",
        fontSize: "1.2rem",
    },
    badge: {
        position: "absolute",
        top: "-6px",
        right: "-6px",
        background: "#ef4444",
        color: "#fff",
        borderRadius: "999px",
        fontSize: "0.7rem",
        fontWeight: "bold",
        padding: "2px 5px",
        lineHeight: 1,
    },
    dropdown: {
        position: "absolute",
        top: "calc(100% + 8px)",
        right: 0,
        width: "320px",
        background: "#ffffff",
        borderRadius: "14px",
        boxShadow: "0 8px 30px rgba(0,0,0,0.2)",
        zIndex: 100,
        overflow: "hidden",
    },
    dropHeader: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "12px 16px",
        borderBottom: "1px solid #e5e7eb",
    },
    dropTitle: { fontWeight: "700", color: "#111827", fontSize: "0.95rem" },
    markAllBtn: {
        background: "none",
        border: "none",
        color: "#2563eb",
        cursor: "pointer",
        fontSize: "0.82rem",
        fontWeight: "600",
    },
    list: { maxHeight: "360px", overflowY: "auto" },
    empty: { padding: "20px 16px", color: "#9ca3af", textAlign: "center", margin: 0 },
    item: {
        padding: "12px 16px",
        borderBottom: "1px solid #f3f4f6",
        cursor: "default",
    },
    itemUnread: {
        background: "#eff6ff",
        cursor: "pointer",
    },
    itemTitle: { margin: "0 0 2px", fontWeight: "700", color: "#111827", fontSize: "0.88rem" },
    itemMsg: { margin: "0 0 4px", color: "#374151", fontSize: "0.85rem" },
    itemTime: { margin: 0, color: "#9ca3af", fontSize: "0.75rem" },
};

export default NotificationBell;
