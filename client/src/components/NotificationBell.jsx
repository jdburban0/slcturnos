import { useState, useEffect, useRef } from "react";
import { getNotifications, markAllNotificationsRead, markNotificationRead, clearNotifications } from "../api/index.js";

function NotificationBell({ token, refreshSignal }) {
    const [notifications, setNotifications] = useState([]);
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    const unread = notifications.filter((n) => !n.isRead).length;

    async function load() {
        try {
            const data = await getNotifications(token);
            setNotifications(data);
        } catch {}
    }

    useEffect(() => {
        load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, refreshSignal]);

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
        } catch {}
    }

    async function handleClear() {
        try {
            await clearNotifications(token);
            setNotifications([]);
        } catch {}
    }

    async function handleMarkOne(id) {
        try {
            await markNotificationRead(token, id);
            setNotifications((prev) =>
                prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
            );
        } catch {}
    }

    return (
        <div ref={ref} style={styles.wrapper}>
            <button style={styles.bellBtn} onClick={() => setOpen((o) => !o)}>
                🔔
                {unread > 0 && <span style={styles.badge}>{unread}</span>}
            </button>

            {open && (
                <div style={styles.dropdown} className="dropdown-anim">
                    <div style={styles.dropHeader}>
                        <span style={styles.dropTitle}>Notificaciones</span>
                        <div style={styles.headerActions}>
                            {unread > 0 && (
                                <button style={styles.markAllBtn} onClick={handleMarkAll}>
                                    Marcar todas
                                </button>
                            )}
                            {notifications.length > 0 && (
                                <button style={styles.clearBtn} onClick={handleClear}>
                                    Limpiar
                                </button>
                            )}
                        </div>
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
        background: "var(--card-bg)",
        border: "1px solid var(--border-color)",
        borderRadius: "10px",
        padding: "8px 12px",
        cursor: "pointer",
        fontSize: "1.2rem",
        transition: "transform 0.15s ease, filter 0.15s ease",
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
        background: "var(--card-bg)",
        border: "1px solid var(--card-border)",
        borderRadius: "14px",
        boxShadow: "var(--card-shadow)",
        zIndex: 100,
        overflow: "hidden",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
    },
    dropHeader: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "12px 16px",
        borderBottom: "1px solid var(--border-color)",
    },
    dropTitle: { fontWeight: "700", color: "var(--text-main)", fontSize: "0.95rem" },
    headerActions: {
        display: "flex",
        gap: "12px",
        alignItems: "center",
    },
    markAllBtn: {
        background: "none",
        border: "none",
        color: "var(--primary)",
        cursor: "pointer",
        fontSize: "0.82rem",
        fontWeight: "600",
    },
    clearBtn: {
        background: "none",
        border: "none",
        color: "var(--text-muted)",
        cursor: "pointer",
        fontSize: "0.82rem",
        fontWeight: "600",
        transition: "color 0.15s ease",
    },
    list: { maxHeight: "360px", overflowY: "auto" },
    empty: { padding: "20px 16px", color: "var(--text-muted)", textAlign: "center", margin: 0 },
    item: {
        padding: "12px 16px",
        borderBottom: "1px solid var(--border-color)",
        cursor: "default",
        transition: "background 0.15s ease",
    },
    itemUnread: {
        background: "var(--primary-light)",
        cursor: "pointer",
    },
    itemTitle: { margin: "0 0 2px", fontWeight: "700", color: "var(--text-main)", fontSize: "0.88rem" },
    itemMsg: { margin: "0 0 4px", color: "var(--text-muted)", fontSize: "0.85rem" },
    itemTime: { margin: 0, color: "var(--text-muted)", fontSize: "0.75rem" },
};

export default NotificationBell;
