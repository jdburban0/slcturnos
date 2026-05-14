import { useState, useEffect } from "react";

const BASE = import.meta.env.VITE_API_URL || "";

function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function subscribeAndSave(token) {
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
}

async function testPush(token) {
    const res = await fetch(`${BASE}/api/push/test`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
}

export default function PushPrompt({ token }) {
    // "idle" | "activar" | "probar" | "hidden"
    const [mode, setMode] = useState("hidden");
    const [loading, setLoading] = useState(false);
    const [testResult, setTestResult] = useState(null);

    useEffect(() => {
        if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return;

        const dismissed = localStorage.getItem("push-prompt-dismissed");
        if (dismissed) return;

        if (Notification.permission === "granted") {
            // Ya tiene permiso — mostrar botón Probar para confirmar suscripción
            setTimeout(() => setMode("probar"), 2000);
        } else if (Notification.permission === "default") {
            setTimeout(() => setMode("activar"), 3000);
        }
    }, []);

    async function handleActivar() {
        setLoading(true);
        try {
            const permission = await Notification.requestPermission();
            if (permission !== "granted") { setMode("hidden"); return; }
            await subscribeAndSave(token);
            setMode("probar");
        } catch (err) {
            console.error("[Push] Error al activar:", err);
        } finally {
            setLoading(false);
        }
    }

    async function handleProbar() {
        setLoading(true);
        try {
            await subscribeAndSave(token); // re-guardar por si acaso
            const r = await testPush(token);
            setTestResult(r?.ok ? "✓ Listo" : r?.message || "Error");
            if (r?.ok) {
                setTimeout(() => {
                    localStorage.setItem("push-prompt-dismissed", "1");
                    setMode("hidden");
                }, 2000);
            }
        } catch (err) {
            console.error("[Push] Error al probar:", err);
            setTestResult("Error");
        } finally {
            setLoading(false);
        }
    }

    function handleDismiss() {
        localStorage.setItem("push-prompt-dismissed", "1");
        setMode("hidden");
    }

    if (mode === "hidden") return null;

    return (
        <div className="anim-slide-right" style={styles.banner}>
            <div style={styles.icon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
            </div>
            <div style={styles.text}>
                <span style={styles.title}>
                    {mode === "probar" ? "Notificaciones activadas" : "Activar notificaciones"}
                </span>
                <span style={styles.sub}>
                    {mode === "probar" ? "Toca Probar para verificar que funciona" : "Recibe avisos aunque tengas la app cerrada"}
                </span>
            </div>
            <button style={styles.activar} onClick={mode === "probar" ? handleProbar : handleActivar} disabled={loading}>
                {loading ? "..." : testResult || (mode === "probar" ? "Probar" : "Activar")}
            </button>
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
        left: "16px",
        right: "16px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        background: "var(--card-bg)",
        border: "1px solid var(--card-border)",
        borderRadius: "14px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        padding: "12px 14px",
        zIndex: 400,
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
        fontSize: "0.85rem",
        fontWeight: "700",
        color: "var(--text-main)",
    },
    sub: {
        fontSize: "0.72rem",
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
        whiteSpace: "nowrap",
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
