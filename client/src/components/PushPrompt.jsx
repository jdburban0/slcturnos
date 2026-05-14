import { useState, useEffect } from "react";

const BASE = import.meta.env.VITE_API_URL || "";

function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export async function testPush(token) {
    const res = await fetch(`${BASE}/api/push/test`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    console.log("[Push test]", data);
    return data;
}

export default function PushPrompt({ token }) {
    const [visible, setVisible] = useState(false);
    const [loading, setLoading] = useState(false);

    const [testResult, setTestResult] = useState(null);

    useEffect(() => {
        if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
        const dismissed = localStorage.getItem("push-prompt-dismissed");

        if (Notification.permission === "granted" && !dismissed) {
            // Ya tiene permiso pero no ha confirmado suscripción — reenviar suscripción
            setVisible(true);
            return;
        }
        if (Notification.permission !== "default") return;
        if (dismissed) return;
        const t = setTimeout(() => setVisible(true), 3000);
        return () => clearTimeout(t);
    }, []);

    async function handleActivar() {
        setLoading(true);
        try {
            const permission = await Notification.requestPermission();
            if (permission !== "granted") { setVisible(false); return; }

            const registration = await navigator.serviceWorker.ready;
            const res = await fetch(`${BASE}/api/push/vapid-public-key`);
            const { publicKey } = await res.json();
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey),
            });
            const { endpoint, keys } = subscription.toJSON();
            await fetch(`${BASE}/api/push/subscribe`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ endpoint, keys }),
            });
            localStorage.setItem("push-prompt-dismissed", "1");
            setVisible(false);
        } catch (err) {
            console.error("[Push] Error al activar:", err);
        } finally {
            setLoading(false);
        }
    }

    function handleDismiss() {
        localStorage.setItem("push-prompt-dismissed", "1");
        setVisible(false);
    }

    if (!visible) return null;

    return (
        <div className="anim-slide-right" style={styles.banner}>
            <div style={styles.icon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
            </div>
            <div style={styles.text}>
                <span style={styles.title}>Activar notificaciones</span>
                <span style={styles.sub}>Recibe avisos aunque tengas la app cerrada</span>
            </div>
            {Notification.permission === "granted" ? (
                <button style={styles.activar} onClick={async () => {
                    setLoading(true);
                    const r = await testPush(token);
                    setTestResult(r?.ok ? "✓ Enviado" : r?.message || "Error");
                    setLoading(false);
                }} disabled={loading}>
                    {loading ? "..." : testResult || "Probar"}
                </button>
            ) : (
                <button style={styles.activar} onClick={handleActivar} disabled={loading}>
                    {loading ? "..." : "Activar"}
                </button>
            )}
            <button style={styles.close} onClick={handleDismiss} aria-label="Cerrar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        </div>
    );
}

const styles = {
    banner: {
        position: "fixed",
        bottom: "24px",
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        background: "var(--card-bg)",
        border: "1px solid var(--card-border)",
        borderRadius: "14px",
        boxShadow: "var(--card-shadow)",
        backdropFilter: "blur(16px)",
        padding: "12px 16px",
        zIndex: 400,
        maxWidth: "calc(100vw - 32px)",
        width: "360px",
    },
    icon: {
        width: "36px",
        height: "36px",
        borderRadius: "10px",
        background: "var(--primary-light)",
        color: "var(--primary)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    text: {
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        flex: 1,
        minWidth: 0,
    },
    title: {
        fontSize: "0.88rem",
        fontWeight: "700",
        color: "var(--text-main)",
    },
    sub: {
        fontSize: "0.75rem",
        color: "var(--text-muted)",
    },
    activar: {
        background: "var(--primary)",
        color: "#fff",
        border: "none",
        borderRadius: "8px",
        padding: "7px 14px",
        fontSize: "0.82rem",
        fontWeight: "700",
        cursor: "pointer",
        flexShrink: 0,
    },
    close: {
        background: "none",
        border: "none",
        color: "var(--text-muted)",
        cursor: "pointer",
        padding: "4px",
        display: "flex",
        alignItems: "center",
        flexShrink: 0,
    },
};
