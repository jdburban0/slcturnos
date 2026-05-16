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

const EXIT_MS = 320;

export default function PasskeyPrompt({ token, onDone }) {
    const [visible, setVisible] = useState(false);
    const [exiting, setExiting] = useState(false);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState(null); // null | "success" | "error"

    useEffect(() => {
        if (!shouldShow()) { onDone?.(); return; }

        window.PublicKeyCredential
            .isUserVerifyingPlatformAuthenticatorAvailable()
            .then((available) => {
                if (available) setTimeout(() => setVisible(true), 600);
                else onDone?.();
            })
            .catch(() => onDone?.());
    }, []);

    // Bloquear scroll del fondo (iOS necesita position:fixed)
    useEffect(() => {
        if (!visible) return;
        const scrollY = window.scrollY;
        const body = document.body;
        const prev = { overflow: body.style.overflow, position: body.style.position, top: body.style.top, width: body.style.width };
        body.style.overflow = "hidden";
        body.style.position = "fixed";
        body.style.top = `-${scrollY}px`;
        body.style.width = "100%";
        return () => {
            body.style.overflow = prev.overflow;
            body.style.position = prev.position;
            body.style.top = prev.top;
            body.style.width = prev.width;
            window.scrollTo(0, scrollY);
        };
    }, [visible]);

    function close(cb) {
        setExiting(true);
        setTimeout(() => {
            setVisible(false);
            setExiting(false);
            cb?.();
            onDone?.();
        }, EXIT_MS);
    }

    function dismiss() {
        localStorage.setItem(DISMISSED_KEY, String(Date.now()));
        close();
    }

    async function handleActivar() {
        setLoading(true);
        setStatus(null);
        try {
            const options = await getPasskeyRegisterOptions(token);
            const response = await startRegistration({ optionsJSON: options });
            await verifyPasskeyRegistration(token, response);
            setStatus("success");
            // No volver a preguntar
            localStorage.setItem(DISMISSED_KEY, String(Date.now() + 9999 * 24 * 60 * 60 * 1000));
            setTimeout(() => close(), 1600);
        } catch (err) {
            if (err?.name === "NotAllowedError") {
                dismiss();
            } else {
                setStatus("error");
                setTimeout(() => setStatus(null), 2500);
            }
        } finally {
            setLoading(false);
        }
    }

    if (!visible) return null;

    return (
        <div
            style={{
                ...styles.overlay,
                animation: exiting
                    ? "overlayFadeOut 0.28s ease forwards"
                    : "overlayFadeIn 0.22s ease both",
            }}
        >
            <div className={exiting ? "modal-exit" : "modal-box-anim"} style={styles.sheet}>

                {/* Ícono */}
                <div style={styles.iconWrap}>
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                        <path d="M9 12l2 2 4-4"/>
                    </svg>
                </div>

                <h3 style={styles.title}>Entra más rápido</h3>
                <p style={styles.desc}>
                    Usa Face ID, huella dactilar o Windows Hello para iniciar sesión sin escribir tu contraseña.
                </p>

                {status === "success" && (
                    <div style={styles.successBadge}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        Passkey activada
                    </div>
                )}
                {status === "error" && (
                    <p style={styles.errorMsg}>Algo salió mal, intenta más tarde</p>
                )}

                {!status && (
                    <div style={styles.actions}>
                        <button style={styles.btnPrimary} onClick={handleActivar} disabled={loading}>
                            {loading
                                ? <><span style={styles.spinner} />Activando…</>
                                : "Activar"}
                        </button>
                        <button style={styles.btnSecondary} onClick={dismiss} disabled={loading}>
                            Ahora no
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

const styles = {
    overlay: {
        position: "fixed", inset: 0, zIndex: 500,
        background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "24px",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
    },
    sheet: {
        width: "100%", maxWidth: "360px",
        background: "var(--card-bg)",
        borderRadius: "24px",
        padding: "32px 28px 28px",
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: "14px",
        boxShadow: "0 24px 64px rgba(0,0,0,0.28)",
        border: "1px solid var(--card-border)",
    },
    iconWrap: {
        width: "64px", height: "64px", borderRadius: "18px",
        background: "var(--primary-light, rgba(37,99,235,0.12))",
        color: "var(--primary)",
        display: "flex", alignItems: "center", justifyContent: "center",
        marginTop: "4px",
    },
    title: {
        margin: 0, fontSize: "1.2rem", fontWeight: "800",
        color: "var(--text-main)", textAlign: "center",
        letterSpacing: "-0.01em",
    },
    desc: {
        margin: 0, fontSize: "0.88rem", color: "var(--text-muted)",
        textAlign: "center", lineHeight: 1.6, maxWidth: "300px",
    },
    actions: {
        width: "100%", display: "flex", flexDirection: "column", gap: "8px",
        marginTop: "6px",
    },
    btnPrimary: {
        width: "100%", padding: "15px",
        background: "var(--primary)", color: "#fff",
        border: "none", borderRadius: "14px",
        fontSize: "0.97rem", fontWeight: "700", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
        transition: "opacity 0.15s",
    },
    btnSecondary: {
        width: "100%", padding: "13px",
        background: "transparent", color: "var(--text-muted)",
        border: "none", borderRadius: "14px",
        fontSize: "0.88rem", fontWeight: "600", cursor: "pointer",
        transition: "color 0.15s",
    },
    successBadge: {
        display: "flex", alignItems: "center", gap: "6px",
        background: "var(--success-bg, #d1fae5)", color: "var(--success, #16a34a)",
        padding: "8px 16px", borderRadius: "10px",
        fontSize: "0.9rem", fontWeight: "700",
    },
    errorMsg: {
        color: "var(--danger, #dc2626)", fontSize: "0.88rem",
        margin: 0, textAlign: "center",
    },
    spinner: {
        display: "inline-block",
        width: "14px", height: "14px",
        border: "2px solid rgba(255,255,255,0.3)",
        borderTopColor: "#fff",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
    },
};
