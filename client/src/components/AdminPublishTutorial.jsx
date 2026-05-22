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

    useEffect(() => {
        setCanAdvance(false);
        const t = setTimeout(() => setCanAdvance(true), 2000);
        return () => clearTimeout(t);
    }, [step]);

    const STEPS = 1;
    const isLast = step === STEPS;

    return (
        <div style={styles.overlay}>
            <div style={{ ...styles.modal, maxWidth: "500px" }}>

                <div style={styles.header}>
                    <span style={styles.tutorialBadge}>Novedades</span>
                    <div style={styles.stepIndicator}>
                        {Array.from({ length: STEPS + 1 }).map((_, i) => (
                            <div key={i} style={{ ...styles.dot, background: i <= step ? "#3b82f6" : "var(--card-border)" }} />
                        ))}
                    </div>
                </div>

                {step === 0 && (
                    <>
                        <h2 style={styles.title}>Nuevo estilo en el horario</h2>
                        <p style={styles.desc}>
                            Cada turno ahora tiene su propio recuadro, separando visualmente
                            los turnos dentro de un mismo día.
                        </p>
                        <div style={styles.visualBox}>
                            <ScheduleStyleVisual />
                        </div>
                    </>
                )}

                {step === 1 && (
                    <>
                        <h2 style={styles.title}>Botón Exportar mejorado</h2>
                        <p style={styles.desc}>
                            Los botones de exportar se unieron en uno solo. Haz clic en{" "}
                            <strong>Exportar</strong> para elegir entre guardar el horario como imagen{" "}
                            <strong>JPG</strong> o como archivo <strong>Excel</strong>.
                        </p>
                        <div style={styles.visualBox}>
                            <ExportButtonVisual />
                        </div>
                    </>
                )}

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
                        {!canAdvance ? "Un momento..." : isLast ? "Entendido" : "Siguiente"}
                    </button>
                </div>

                <p style={styles.stepLabel}>Paso {step + 1} de {STEPS + 1}</p>
            </div>
        </div>
    );
}

/* ── Visuales ── */

function ScheduleStyleVisual() {
    const tableContent = (isNew) => (
        <div style={sv.table}>
            <div style={{ display: "flex" }}>
                <div style={{ ...sv.headerCell, flex: 1 }}>Lunes</div>
                <div style={{ ...sv.headerCell, flex: 1, borderLeft: "1px solid #2d4a6b" }}>Martes</div>
            </div>
            <div style={{ display: "flex", borderTop: "1px solid #1e293b" }}>
                {/* Lunes */}
                <div style={{ ...(isNew ? sv.tdNew : sv.tdOld), flex: 1 }}>
                    {isNew ? (
                        <div style={sv.boxNew}>
                            <div style={sv.timeNew}>7:30am - 4:30pm</div>
                            <div style={sv.nameNew}>Isabella G.</div>
                            <div style={sv.nameNew}>David Reyes</div>
                            <div style={sv.nameNew}>Esteban T.</div>
                            <div style={sv.slotNew}>4</div>
                            <div style={sv.slotNew}>5</div>
                        </div>
                    ) : (
                        <>
                            <div style={sv.timeOld}>7:30am - 4:30pm</div>
                            <div style={sv.nameOld}>Isabella G.</div>
                            <div style={sv.nameOld}>David Reyes</div>
                            <div style={sv.nameOld}>Esteban T.</div>
                            <div style={sv.slotOld}>4</div>
                            <div style={sv.slotOld}>5</div>
                        </>
                    )}
                </div>
                {/* Martes */}
                <div style={{ ...(isNew ? sv.tdNew : sv.tdOld), flex: 1, borderLeft: "1px solid #1e293b" }}>
                    {isNew ? (
                        <div style={sv.boxNew}>
                            <div style={sv.timeNew}>7:30am - 4:30pm</div>
                            <div style={sv.nameNew}>Nicolás C.</div>
                        </div>
                    ) : (
                        <>
                            <div style={sv.timeOld}>7:30am - 4:30pm</div>
                            <div style={sv.nameOld}>Nicolás C.</div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <div style={viz.card}>
            {/* Antes */}
            <div style={sv.colLabel}>Antes</div>
            {tableContent(false)}
            {/* Flecha */}
            <div style={{ display: "flex", justifyContent: "center" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><polyline points="5 12 12 19 19 12"/>
                </svg>
            </div>
            {/* Ahora */}
            <div style={sv.colLabel}>Ahora</div>
            {tableContent(true)}
        </div>
    );
}

function ExportButtonVisual() {
    return (
        <div style={viz.card}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "flex-end", gap: "8px" }}>
                <p style={{ margin: 0, fontSize: "0.72rem", color: "#64748b", textAlign: "right", paddingTop: "10px" }}>
                    Ubicado sobre<br />la tabla del horario
                </p>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                    <div style={ev.btn}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        Exportar
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9"/>
                        </svg>
                    </div>
                    <div style={ev.menu}>
                        <div style={ev.item}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                            </svg>
                            JPG
                        </div>
                        <div style={ev.item}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                            </svg>
                            Excel
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ── Estilos modal ── */
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
        maxWidth: "400px",
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

/* ── Estilos visuales — comparación celdas ── */
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
};

const sv = {
    colLabel: {
        fontSize: "0.65rem", fontWeight: "700", color: "#64748b",
        textTransform: "uppercase", letterSpacing: "0.05em",
        marginBottom: "4px", textAlign: "center",
    },
    table: {
        border: "1px solid #334155", borderRadius: "6px", overflow: "hidden",
    },
    headerCell: {
        background: "#1e3a5f", color: "#e2e8f0",
        fontSize: "0.62rem", fontWeight: "700",
        textAlign: "center", padding: "4px 2px",
    },
    tdOld: {
        padding: "5px 4px",
    },
    timeOld: {
        fontSize: "0.58rem", fontWeight: "700", color: "#cbd5e1",
        textAlign: "center", marginBottom: "3px",
    },
    nameOld: {
        fontSize: "0.57rem", color: "#94a3b8", textAlign: "center", lineHeight: 1.4,
    },
    slotOld: {
        fontSize: "0.57rem", color: "#475569", textAlign: "center", lineHeight: 1.4,
    },
    tdNew: {
        padding: "5px 3px",
    },
    boxNew: {
        border: "1px solid #334155", borderRadius: "5px",
        padding: "4px 3px", background: "#1e293b",
    },
    timeNew: {
        fontSize: "0.58rem", fontWeight: "700", color: "#cbd5e1",
        textAlign: "center", marginBottom: "3px",
    },
    nameNew: {
        fontSize: "0.57rem", color: "#94a3b8", textAlign: "center", lineHeight: 1.4,
    },
    slotNew: {
        fontSize: "0.57rem", color: "#475569", textAlign: "center", lineHeight: 1.4,
    },
};

/* ── Estilos visuales — botón exportar ── */
const ev = {
    btn: {
        display: "inline-flex", alignItems: "center", gap: "6px",
        background: "#2563eb", color: "#fff",
        border: "1.5px solid #2563eb", borderRadius: "8px",
        padding: "7px 12px", fontSize: "0.8rem", fontWeight: "700",
    },
    menu: {
        background: "#ffffff", border: "1.5px solid #e2e8f0",
        borderRadius: "8px", boxShadow: "0 4px 12px rgba(15,23,42,0.12)",
        overflow: "hidden", minWidth: "110px",
    },
    item: {
        display: "flex", alignItems: "center", gap: "8px",
        padding: "9px 12px", fontSize: "0.78rem", fontWeight: "700",
        color: "#1e293b",
    },
};
