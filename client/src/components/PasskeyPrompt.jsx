import { useState, useEffect } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { getPasskeyRegisterOptions, verifyPasskeyRegistration } from "../api/index.js";

const DISMISSED_KEY = "passkey-prompt-dismissed-at";
const ASK_AGAIN_DAYS = 14;

function shouldShow() {
    if (!window.PublicKeyCredential) return false;
    if (!window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) return false;
    const dismissedAt = localStorage.getItem(DISMISSED_KEY);
    if (dismissedAt) {
        const daysSince = (Date.now() - Number(dismissedAt)) / (1000 * 60 * 60 * 24);
        if (daysSince < ASK_AGAIN_DAYS) return false;
    }
    return true;
}

export default function PasskeyPrompt({ token, onDone }) {
    const [visible, setVisible] = useState(false);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState(null); // null | "success" | "error"

    useEffect(() => {
        if (!shouldShow()) { onDone?.(); return; }

        // Verificar que el dispositivo tiene autenticador biométrico
        window.PublicKeyCredential
            .isUserVerifyingPlatformAuthenticatorAvailable()
            .then((available) => {
                if (available) {
                    setTimeout(() => setVisible(true), 800);
                } else {
                    onDone?.();
                }
            })
            .catch(() => onDone?.());
    }, []);

    function dismiss() {
        localStorage.setItem(DISMISSED_KEY, String(Date.now()));
        setVisible(false);
        onDone?.();
    }

    async function handleActivar() {
        setLoading(true);
        setStatus(null);
        try {
            const options = await getPasskeyRegisterOptions(token);
            const response = await startRegistration({ optionsJSON: options });
            await verifyPasskeyRegistration(token, response);
            setStatus("success");
            localStorage.setItem(DISMISSED_KEY, String(Date.now() + 9999 * 24 * 60 * 60 * 1000)); // no volver a preguntar
            setTimeout(() => { setVisible(false); onDone?.(); }, 1800);
        } catch (err) {
            // El usuario canceló el diálogo o algo falló — no mostrar error, solo cerrar
            if (err?.name !== "NotAllowedError") {
                setStatus("error");
                setTimeout(() => setStatus(null), 2500);
            } else {
                dismiss();
            }
        } finally {
            setLoading(false);
        }
    }

    if (!visible) return null;

    return (
        <div style={styles.overlay}>
            <div className="anim-slide-up" style={styles.sheet}>
                <div style={styles.handle} />

                <div style={styles.iconWrap}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                        <path d="M9 12l2 2 4-4"/>
                    </svg>
                </div>

                <h3 style={styles.title}>Inicia sesión más rápido</h3>
                <p style={styles.desc}>
                    Activa Face ID, huella o Windows Hello para entrar a SLC Turnos sin escribir tu contraseña.
                </p>

                {status === "success" && (
                    <p style={styles.successMsg}>✓ Passkey activada correctamente</p>
                )}
                {status === "error" && (
                    <p style={styles.errorMsg}>Algo salió mal, intenta más tarde</p>
                )}

                {!status && (
                    <>
                        <button style={styles.btnPrimary} onClick={handleActivar} disabled={loading}>
                            {loading ? "Activando…" : "Activar"}
                        </button>
                        <button style={styles.btnSecondary} onClick={dismiss} disabled={loading}>
                            Ahora no
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

const styles = {
    overlay: {
        position: "fixed", inset: 0, zIndex: 500,
        background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        backdropFilter: "blur(4px)",
    },
    sheet: {
        width: "100%", maxWidth: "480px",
        background: "var(--card-bg)",
        borderRadius: "20px 20px 0 0",
        padding: "12px 28px 36px",
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: "12px",
        boxShadow: "0 -8px 40px rgba(0,0,0,0.2)",
    },
    handle: {
        width: "40px", height: "4px", borderRadius: "2px",
        background: "var(--border-color)", marginBottom: "8px",
    },
    iconWrap: {
        width: "60px", height: "60px", borderRadius: "16px",
        background: "var(--primary-light)", color: "var(--primary)",
        display: "flex", alignItems: "center", justifyContent: "center",
    },
    title: {
        margin: 0, fontSize: "1.15rem", fontWeight: "800",
        color: "var(--text-main)", textAlign: "center",
    },
    desc: {
        margin: 0, fontSize: "0.88rem", color: "var(--text-muted)",
        textAlign: "center", lineHeight: 1.55, maxWidth: "320px",
    },
    btnPrimary: {
        width: "100%", padding: "14px",
        background: "var(--primary)", color: "#fff",
        border: "none", borderRadius: "12px",
        fontSize: "0.95rem", fontWeight: "700", cursor: "pointer",
        marginTop: "4px",
    },
    btnSecondary: {
        width: "100%", padding: "12px",
        background: "transparent", color: "var(--text-muted)",
        border: "none", borderRadius: "12px",
        fontSize: "0.88rem", fontWeight: "600", cursor: "pointer",
    },
    successMsg: {
        color: "var(--success, #16a34a)", fontSize: "0.9rem",
        fontWeight: "600", margin: "4px 0",
    },
    errorMsg: {
        color: "var(--danger, #dc2626)", fontSize: "0.88rem", margin: "4px 0",
    },
};
