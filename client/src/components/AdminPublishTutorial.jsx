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

    const STEPS = 0;
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
                        <h2 style={styles.title}>Nuevo botón "Editar" en turnos</h2>
                        <p style={styles.desc}>
                            Los botones <strong>Cupos</strong> y <strong>Horario</strong> se unieron en uno solo.
                            Haz clic en <strong>Editar</strong> para modificar el rango de horas y los cupos
                            de cualquier turno desde un mismo lugar.
                        </p>
                        <div style={styles.visualBox}>
                            <EditModalVisual />
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
                            marginLeft: "auto",
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

/* ── Visual: simulación del botón Editar y el modal ── */

function EditModalVisual() {
    return (
        <div style={viz.card}>
            {/* Fila de tabla simulada */}
            <div style={em.tableRow}>
                <span style={em.timeText}>7:30am – 4:30pm</span>
                <span style={em.slotsText}>3 cupos</span>
                <div style={em.editBtn}>Editar</div>
            </div>
            {/* Flecha hacia abajo */}
            <div style={{ display: "flex", justifyContent: "center" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><polyline points="5 12 12 19 19 12"/>
                </svg>
            </div>
            {/* Modal simulado */}
            <div style={em.modalSim}>
                <div style={em.modalTitle}>Editar turno</div>
                <div style={em.modalSub}>Diurno - Lunes · lun., 1 sep.</div>
                {/* Sección horario */}
                <div style={em.section}>
                    <div style={em.sectionLabel}>Horario</div>
                    <div style={em.timeRow}>
                        <div style={em.timeField}>
                            <span style={em.fieldLabel}>Inicio</span>
                            <div style={em.timeInput}>07:30</div>
                        </div>
                        <div style={em.timeField}>
                            <span style={em.fieldLabel}>Fin</span>
                            <div style={em.timeInput}>16:30</div>
                        </div>
                    </div>
                </div>
                {/* Sección cupos */}
                <div style={{ ...em.section, borderTop: "1px solid #1e293b", paddingTop: "10px" }}>
                    <div style={em.sectionLabel}>Cupos</div>
                    <div style={em.slotsRow}>
                        <div style={em.slotBtn}>−</div>
                        <span style={em.slotNum}>3</span>
                        <div style={em.slotBtn}>+</div>
                        <span style={em.slotLabel}>cupos</span>
                    </div>
                </div>
                {/* Footer */}
                <div style={em.modalFooter}>
                    <div style={em.cancelBtn}>Cancelar</div>
                    <div style={em.saveBtn}>Guardar cambios</div>
                </div>
            </div>
        </div>
    );
}

/* ── Estilos del modal del tutorial ── */
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

/* ── Estilos del contenedor oscuro ── */
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

/* ── Estilos de la visual del modal "Editar" ── */
const em = {
    /* Fila de tabla simulada */
    tableRow: {
        display: "flex", alignItems: "center", gap: "10px",
        background: "#1e293b", borderRadius: "7px", padding: "8px 12px",
    },
    timeText: { flex: 1, fontSize: "0.72rem", color: "#cbd5e1", fontWeight: "600" },
    slotsText: { fontSize: "0.68rem", color: "#64748b" },
    editBtn: {
        background: "#2563eb", color: "#fff", borderRadius: "5px",
        padding: "4px 10px", fontSize: "0.68rem", fontWeight: "700",
    },
    /* Modal simulado */
    modalSim: {
        background: "#1e293b", borderRadius: "10px", padding: "14px",
        display: "flex", flexDirection: "column", gap: "10px",
        border: "1px solid #334155", textAlign: "left",
    },
    modalTitle: { fontSize: "0.82rem", fontWeight: "800", color: "#e2e8f0" },
    modalSub: { fontSize: "0.65rem", color: "#64748b", marginTop: "-6px" },
    section: { display: "flex", flexDirection: "column", gap: "8px" },
    sectionLabel: {
        fontSize: "0.6rem", fontWeight: "700", color: "#475569",
        textTransform: "uppercase", letterSpacing: "0.05em",
    },
    timeRow: { display: "flex", gap: "8px" },
    timeField: { flex: 1, display: "flex", flexDirection: "column", gap: "4px" },
    fieldLabel: { fontSize: "0.6rem", color: "#475569" },
    timeInput: {
        background: "#0f172a", border: "1px solid #334155", borderRadius: "5px",
        padding: "5px 8px", fontSize: "0.72rem", color: "#cbd5e1", fontWeight: "600",
    },
    slotsRow: { display: "flex", alignItems: "center", gap: "8px" },
    slotBtn: {
        background: "#0f172a", border: "1px solid #334155", borderRadius: "5px",
        width: "22px", height: "22px", display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "0.8rem", color: "#cbd5e1", fontWeight: "700",
    },
    slotNum: { fontSize: "0.9rem", fontWeight: "800", color: "#e2e8f0", minWidth: "20px", textAlign: "center" },
    slotLabel: { fontSize: "0.65rem", color: "#475569" },
    modalFooter: { display: "flex", gap: "8px", justifyContent: "flex-end", paddingTop: "2px" },
    cancelBtn: {
        background: "transparent", border: "1px solid #334155", borderRadius: "6px",
        padding: "5px 10px", fontSize: "0.68rem", color: "#64748b", fontWeight: "700",
    },
    saveBtn: {
        background: "#2563eb", borderRadius: "6px",
        padding: "5px 10px", fontSize: "0.68rem", color: "#fff", fontWeight: "700",
    },
};
