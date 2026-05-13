import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { completeTutorial as completeTutorialAPI } from "../api/index.js";

export function useAdminTutorial() {
    const { user, token, updateUser } = useAuth();
    const [show, setShow] = useState(false);

    useEffect(() => {
        if (!user) return;
        if ((user.role === "admin" || user.role === "lead") && !user.tutorialDone) setShow(true);
    }, [user?.id]);

    async function complete() {
        try {
            await completeTutorialAPI(token);
        } catch (err) {
            console.error("[Tutorial] Error al guardar en BDD:", err.message);
        }
        updateUser({ tutorialDone: true });
        setShow(false);
    }

    return { show, complete };
}

export default function AdminPublishTutorial({ onComplete }) {
    const [step, setStep] = useState(0);
    const [canAdvance, setCanAdvance] = useState(false);

    // Habilitar botón avanzar después de 2.5s en cada paso
    useEffect(() => {
        setCanAdvance(false);
        const t = setTimeout(() => setCanAdvance(true), 2500);
        return () => clearTimeout(t);
    }, [step]);

    const STEPS = 2;
    const isLast = step === STEPS;

    return (
        <div style={styles.overlay}>
            <div style={styles.modal}>

                {/* Cabecera: badge tutorial + dots */}
                <div style={styles.header}>
                    <span style={styles.tutorialBadge}>Tutorial - Novedades</span>
                    <div style={styles.stepIndicator}>
                        {Array.from({ length: STEPS + 1 }).map((_, i) => (
                            <div key={i} style={{ ...styles.dot, background: i <= step ? "#3b82f6" : "var(--card-border)" }} />
                        ))}
                    </div>
                </div>

                {/* Paso 0 */}
                {step === 0 && (
                    <>
                        <h2 style={styles.title}>El horario empieza oculto</h2>
                        <p style={styles.desc}>
                            Al crear una semana nueva, el horario queda en estado{" "}
                            <strong style={{ color: "#c2410c" }}>Oculto</strong> por defecto.
                            Los operadores <strong>no pueden verlo ni solicitar turnos</strong> hasta que tú lo publiques manualmente.
                        </p>
                        <div style={styles.visualBox}>
                            <StepOneVisual />
                        </div>
                    </>
                )}

                {/* Paso 1 */}
                {step === 1 && (
                    <>
                        <h2 style={styles.title}>Activa el toggle para publicarlo</h2>
                        <p style={styles.desc}>
                            Cambia el toggle a{" "}
                            <strong style={{ color: "#16a34a" }}>Visible</strong> en la sección de horario.
                            En ese momento los operadores podrán ver los turnos y enviar solicitudes.
                        </p>
                        <div style={styles.visualBox}>
                            <StepTwoVisual />
                        </div>
                    </>
                )}

                {/* Paso 2 */}
                {step === 2 && (
                    <>
                        <h2 style={styles.title}>Nuevo menú de navegación</h2>
                        <p style={styles.desc}>
                            Las opciones de <strong>modo oscuro</strong>, <strong>cambiar contraseña</strong> y{" "}
                            <strong>cerrar sesión</strong> ahora están en el menú de las tres rayas, en la esquina superior derecha.
                        </p>
                        <div style={styles.visualBox}>
                            <StepMenuVisual />
                        </div>
                    </>
                )}

                {/* Navegación */}
                <div style={styles.navRow}>
                    {step > 0 && (
                        <button className="tutorial-back-btn" style={styles.backBtn} onClick={() => setStep((s) => s - 1)}>
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ display: "block" }}>
                                <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            Atrás
                        </button>
                    )}
                    <button
                        className="tutorial-btn"
                        style={{
                            ...styles.btn,
                            ...(canAdvance ? {} : styles.btnDisabled),
                            ...(step === 0 ? { marginLeft: "auto" } : {}),
                        }}
                        onClick={canAdvance ? (isLast ? onComplete : () => setStep((s) => s + 1)) : undefined}
                        disabled={!canAdvance}
                    >
                        {!canAdvance
                            ? "Un momento..."
                            : isLast
                                ? "Entendido"
                                : "Siguiente"}
                    </button>
                </div>

                <p style={styles.stepLabel}>Paso {step + 1} de {STEPS + 1}</p>
            </div>
        </div>
    );
}

/* ── Visuales ilustrativos ── */

function StepOneVisual() {
    return (
        <div style={viz.card}>
            <div style={viz.warningBanner}>
                <div style={viz.warningIcon}>!</div>
                <span style={{ fontSize: "0.78rem", color: "#c2410c", fontWeight: 600, textAlign: "left" }}>
                    El horario está sin publicar. Los operadores no podrán solicitar turnos hasta que lo hagas visible.
                </span>
            </div>
            <div style={viz.scheduleRow}>
                <div style={viz.scheduleLeft}>
                    <span style={viz.scheduleTitle}>Schedule</span>
                    <span style={viz.liveBadge}>● LIVE</span>
                </div>
                <div style={viz.toggleRow}>
                    <div style={{ ...viz.toggleTrack, background: "#64748b" }}>
                        <div style={{ ...viz.toggleThumb, left: "3px" }} />
                    </div>
                    <span style={{ fontSize: "0.78rem", color: "#64748b", fontWeight: 600 }}>Oculto</span>
                </div>
            </div>
        </div>
    );
}

function StepTwoVisual() {
    return (
        <div style={viz.card}>
            <div style={viz.scheduleRow}>
                <div style={viz.scheduleLeft}>
                    <span style={viz.scheduleTitle}>Schedule</span>
                    <span style={viz.liveBadge}>● LIVE</span>
                </div>
                <div style={viz.toggleRow}>
                    <div style={{ ...viz.toggleTrack, background: "#16a34a" }}>
                        <div style={{ ...viz.toggleThumb, left: "19px" }} />
                    </div>
                    <span style={{ fontSize: "0.78rem", color: "#16a34a", fontWeight: 600 }}>Visible</span>
                </div>
            </div>
            <div style={viz.miniTable}>
                {["Lun", "Mar", "Mié", "Jue", "Vie"].map((d) => (
                    <div key={d} style={viz.miniCol}>
                        <div style={viz.miniHeader}>{d}</div>
                        <div style={viz.miniCell}>7:30am</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function StepMenuVisual() {
    return (
        <div style={viz.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                    <div style={{ fontWeight: "800", fontSize: "0.95rem", color: "#f1f5f9" }}>Panel Admin</div>
                    <div style={{ fontSize: "0.65rem", color: "#94a3b8", marginTop: "2px" }}>Admin · SLC Turnos</div>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                    <div style={viz.iconBtn}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
                        </svg>
                    </div>
                    <div style={{ ...viz.iconBtn, background: "#3b82f6", border: "1px solid #3b82f6" }}>
                        <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
                            <rect y="2" width="18" height="2" rx="1" fill="#fff" />
                            <rect y="8" width="18" height="2" rx="1" fill="#fff" />
                            <rect y="14" width="18" height="2" rx="1" fill="#fff" />
                        </svg>
                    </div>
                </div>
            </div>
            <div style={viz.dropdown}>
                <div style={viz.dropItem}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
                    <span>Modo oscuro</span>
                </div>
                <div style={viz.dropItem}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                    <span>Cambiar contraseña</span>
                </div>
                <div style={{ height: "1px", background: "#334155", margin: "2px 0" }} />
                <div style={{ ...viz.dropItem, color: "#f87171" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                    <span>Cerrar sesión</span>
                </div>
            </div>
        </div>
    );
}

/* ── Estilos ── */

const styles = {
    overlay: {
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
        backdropFilter: "blur(4px)",
    },
    modal: {
        background: "var(--card-bg)",
        borderRadius: "18px",
        padding: "28px 28px 22px",
        width: "100%",
        maxWidth: "460px",
        margin: "0 16px",
        boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "14px",
        textAlign: "center",
    },
    header: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "10px",
        width: "100%",
    },
    tutorialBadge: {
        background: "var(--primary-muted, #dbeafe)",
        color: "var(--primary, #1e3a5f)",
        fontSize: "0.72rem",
        fontWeight: "700",
        padding: "4px 14px",
        borderRadius: "999px",
        letterSpacing: "0.04em",
        textTransform: "uppercase",
    },
    stepIndicator: {
        display: "flex",
        gap: "6px",
    },
    dot: {
        width: "8px",
        height: "8px",
        borderRadius: "50%",
        transition: "background 0.3s",
    },
    title: {
        margin: 0,
        fontSize: "1.2rem",
        fontWeight: "800",
        color: "var(--text-main)",
    },
    desc: {
        margin: 0,
        fontSize: "0.88rem",
        color: "var(--text-muted)",
        lineHeight: 1.6,
        maxWidth: "380px",
    },
    visualBox: {
        width: "100%",
    },
    navRow: {
        display: "flex",
        gap: "10px",
        width: "100%",
        alignItems: "center",
    },
    backBtn: {
        background: "transparent",
        border: "1px solid var(--card-border)",
        color: "var(--text-muted)",
        padding: "11px 18px",
        borderRadius: "10px",
        fontSize: "0.88rem",
        fontWeight: "600",
        cursor: "pointer",
        whiteSpace: "nowrap",
        display: "flex",
        alignItems: "center",
        gap: "6px",
    },
    btn: {
        flex: 1,
        background: "#3b82f6",
        color: "#fff",
        border: "none",
        padding: "12px 20px",
        borderRadius: "10px",
        fontSize: "0.9rem",
        fontWeight: "700",
        cursor: "pointer",
    },
    btnDisabled: {
        background: "var(--hover-overlay, #e2e8f0)",
        color: "var(--text-muted)",
        cursor: "not-allowed",
    },
    stepLabel: {
        margin: 0,
        fontSize: "0.74rem",
        color: "var(--text-muted)",
    },
};

const viz = {
    card: {
        background: "#0f172a",
        borderRadius: "10px",
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        border: "1px solid #1e293b",
    },
    warningBanner: {
        display: "flex",
        alignItems: "flex-start",
        gap: "8px",
        background: "#fff7ed",
        border: "1px solid #fed7aa",
        borderRadius: "6px",
        padding: "8px 10px",
    },
    warningIcon: {
        flexShrink: 0,
        width: "18px",
        height: "18px",
        borderRadius: "50%",
        background: "#f97316",
        color: "#fff",
        fontSize: "0.72rem",
        fontWeight: "900",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginTop: "1px",
    },
    scheduleRow: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
    },
    scheduleLeft: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
    },
    scheduleTitle: {
        fontWeight: "800",
        fontSize: "0.95rem",
        color: "#f1f5f9",
    },
    liveBadge: {
        fontSize: "0.68rem",
        fontWeight: "700",
        color: "#16a34a",
        background: "#dcfce7",
        padding: "2px 8px",
        borderRadius: "999px",
    },
    toggleRow: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
    },
    toggleTrack: {
        width: "36px",
        height: "20px",
        borderRadius: "999px",
        position: "relative",
    },
    toggleThumb: {
        position: "absolute",
        top: "2px",
        width: "16px",
        height: "16px",
        borderRadius: "50%",
        background: "#fff",
    },
    miniTable: {
        display: "flex",
        gap: "4px",
    },
    miniCol: {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: "3px",
    },
    miniHeader: {
        background: "#1e3a5f",
        color: "#e2e8f0",
        fontSize: "0.68rem",
        fontWeight: "700",
        textAlign: "center",
        padding: "4px 2px",
        borderRadius: "4px",
    },
    miniCell: {
        background: "#1e293b",
        color: "#94a3b8",
        fontSize: "0.62rem",
        textAlign: "center",
        padding: "4px 2px",
        borderRadius: "4px",
    },
    iconBtn: {
        width: "30px", height: "30px", borderRadius: "8px",
        background: "#1e293b", border: "1px solid #334155",
        display: "flex", alignItems: "center", justifyContent: "center",
    },
    dropdown: {
        background: "#1e293b", borderRadius: "8px", padding: "4px",
        border: "1px solid #334155", display: "flex", flexDirection: "column", gap: "2px",
    },
    dropItem: {
        display: "flex", alignItems: "center", gap: "8px", padding: "7px 10px",
        borderRadius: "6px", fontSize: "0.75rem", color: "#e2e8f0", fontWeight: "600",
    },
};
