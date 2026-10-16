import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { completeTutorial as completeTutorialAPI } from "../api/index.js";

export function useAdminTutorial() {
    const { user, token, updateUser } = useAuth();
    const [show, setShow] = useState(false);

    useEffect(() => {
        if (!user) return;
        // Por ahora solo admin, el tutorial de lead se agregará después
        if (user.role === "admin" && !user.tutorialDone) setShow(true);
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

    const STEPS = 2;
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
                        <h2 style={styles.title}>Ya no hay registro libre</h2>
                        <p style={styles.desc}>
                            Los operadores <strong>ya no pueden registrarse</strong> entrando al enlace de la
                            plataforma con un código de acceso. Ese código compartido desapareció.
                            Ahora cada persona necesita una <strong>invitación personal</strong> que tú envías.
                        </p>
                        <div style={styles.visualBox}>
                            <BeforeAfterVisual />
                        </div>
                    </>
                )}

                {step === 1 && (
                    <>
                        <h2 style={styles.title}>Invita desde la pestaña "Invitar"</h2>
                        <p style={styles.desc}>
                            Escribe el correo corporativo de la persona, elige si es
                            <strong> operador</strong> o <strong>lead</strong>, y listo: el sistema le envía
                            el enlace de registro por correo automáticamente.
                        </p>
                        <div style={styles.visualBox}>
                            <InviteFormVisual />
                        </div>
                    </>
                )}

                {step === 2 && (
                    <>
                        <h2 style={styles.title}>Así le llega al operador</h2>
                        <p style={styles.desc}>
                            Recibe un correo con un botón para crear su cuenta. El enlace es
                            <strong> personal</strong> y <strong>expira en 24 horas</strong>. Si no lo usa a
                            tiempo, puedes revocarlo y enviarle uno nuevo.
                        </p>
                        <div style={styles.visualBox}>
                            <InviteEmailVisual />
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

/* ── Visual: antes (código de acceso) vs ahora (invitación) ── */

function BeforeAfterVisual() {
    return (
        <div style={viz.card}>
            <div style={ba.row}>
                <span style={ba.oldLabel}>Antes</span>
                <div style={ba.oldBox}>
                    <div style={em.fieldLabel}>Código de acceso</div>
                    <div style={em.timeInput}>SLCADMIN2025</div>
                </div>
                <span style={ba.strike}>✕</span>
            </div>
            <div style={{ display: "flex", justifyContent: "center" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ color: "var(--primary)" }} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><polyline points="5 12 12 19 19 12"/>
                </svg>
            </div>
            <div style={ba.row}>
                <span style={ba.newLabel}>Ahora</span>
                <div style={ba.newBox}>
                    <div style={em.fieldLabel}>Correo invitado</div>
                    <div style={{ ...em.timeInput, color: "var(--primary)" }}>juan.burbano@sig.systems</div>
                </div>
                <span style={ba.check}>✓</span>
            </div>
        </div>
    );
}

/* ── Visual: mini formulario de invitación ── */

function InviteFormVisual() {
    return (
        <div style={viz.card}>
            <div style={em.modalSim}>
                <div style={em.modalTitle}>Nueva invitación</div>
                <div style={em.sectionLabel}>Rol</div>
                <div style={inv.segment}>
                    <div style={inv.segmentActive}>Operador</div>
                    <div style={inv.segmentInactive}>Lead</div>
                </div>
                <div style={em.sectionLabel}>Correo del operador</div>
                <div style={em.timeInput}>juan.burbano@sig.systems</div>
                <div style={em.modalFooter}>
                    <div style={em.saveBtn}>Invitar operador</div>
                </div>
            </div>
        </div>
    );
}

/* ── Visual: correo de invitación tal como lo recibe el operador ── */

function InviteEmailVisual() {
    return (
        <div style={viz.card}>
            <div style={mail.chrome}>
                <span style={mail.chromeDot} />
                <span style={mail.chromeDot} />
                <span style={mail.chromeDot} />
                <span style={mail.subject}>Invitación a SLC Turnos (Operador)</span>
            </div>
            <div style={mail.body}>
                <p style={mail.heading}>Te invitaron a SLC Turnos</p>
                <p style={mail.text}><strong>Christian Perlaza</strong> te invitó a unirte a SLC Turnos como <strong>Operador</strong>.</p>
                <div style={mail.btn}>Crear mi cuenta</div>
                <p style={mail.hint}>Este enlace es personal y expira en <strong>24 horas</strong>.</p>
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

/* ── Estilos del contenedor de la visual (sigue el tema claro/oscuro) ── */
const viz = {
    card: {
        background: "var(--bg-color)",
        borderRadius: "10px",
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        border: "1px solid var(--border-color)",
    },
};

/* ── Estilos compartidos de modal simulado ── */
const em = {
    modalSim: {
        background: "var(--card-bg)", borderRadius: "10px", padding: "14px",
        display: "flex", flexDirection: "column", gap: "10px",
        border: "1px solid var(--border-color)", textAlign: "left",
    },
    modalTitle: { fontSize: "0.82rem", fontWeight: "800", color: "var(--text-main)" },
    sectionLabel: {
        fontSize: "0.6rem", fontWeight: "700", color: "var(--text-muted)",
        textTransform: "uppercase", letterSpacing: "0.05em",
    },
    fieldLabel: { fontSize: "0.66rem", fontWeight: "700", color: "var(--text-muted)" },
    timeInput: {
        background: "var(--input-bg)", border: "1px solid var(--border-color)", borderRadius: "5px",
        padding: "5px 8px", fontSize: "0.72rem", color: "var(--text-main)", fontWeight: "600",
    },
    modalFooter: { display: "flex", gap: "8px", justifyContent: "flex-end", paddingTop: "2px" },
    saveBtn: {
        background: "var(--primary)", borderRadius: "6px",
        padding: "5px 10px", fontSize: "0.68rem", color: "#fff", fontWeight: "700",
    },
};

/* ── Estilos de la visual "antes / ahora" ── */
const ba = {
    row: { display: "flex", alignItems: "center", gap: "10px" },
    oldLabel: {
        fontSize: "0.62rem", fontWeight: "700", color: "var(--danger)", textTransform: "uppercase",
        letterSpacing: "0.05em", width: "44px", flexShrink: 0,
    },
    newLabel: {
        fontSize: "0.62rem", fontWeight: "700", color: "var(--success)", textTransform: "uppercase",
        letterSpacing: "0.05em", width: "44px", flexShrink: 0,
    },
    oldBox: {
        flex: 1, background: "var(--card-bg)", borderRadius: "8px", padding: "8px 10px",
        display: "flex", flexDirection: "column", gap: "4px", opacity: 0.8,
        border: "1px solid var(--border-color)",
    },
    newBox: {
        flex: 1, background: "var(--card-bg)", borderRadius: "8px", padding: "8px 10px",
        display: "flex", flexDirection: "column", gap: "4px", border: "1px solid var(--primary)",
    },
    strike: { color: "var(--danger)", fontWeight: "800", fontSize: "0.9rem", flexShrink: 0 },
    check: { color: "var(--success)", fontWeight: "800", fontSize: "0.9rem", flexShrink: 0 },
};

/* ── Estilos de la visual del formulario de invitación ── */
const inv = {
    segment: { display: "flex", gap: "4px", background: "var(--hover-overlay)", borderRadius: "6px", padding: "3px" },
    segmentActive: {
        flex: 1, textAlign: "center", background: "var(--primary)", color: "#fff",
        borderRadius: "4px", padding: "4px 0", fontSize: "0.68rem", fontWeight: "700",
    },
    segmentInactive: {
        flex: 1, textAlign: "center", color: "var(--text-muted)",
        borderRadius: "4px", padding: "4px 0", fontSize: "0.68rem", fontWeight: "700",
    },
};

/* ── Estilos de la visual del correo de invitación ── */
const mail = {
    chrome: {
        display: "flex", alignItems: "center", gap: "6px",
        background: "var(--bg-color)", borderRadius: "8px 8px 0 0", padding: "8px 10px",
        border: "1px solid var(--border-color)", borderBottom: "none",
    },
    chromeDot: { width: "7px", height: "7px", borderRadius: "50%", background: "var(--border-color)" },
    subject: { marginLeft: "6px", fontSize: "0.66rem", color: "var(--text-muted)", fontWeight: "600" },
    body: {
        background: "#eef4ff", borderRadius: "0 0 8px 8px", padding: "16px 14px",
        border: "1px solid var(--border-color)", borderTop: "none", textAlign: "left",
    },
    heading: { margin: "0 0 6px", fontSize: "0.86rem", fontWeight: "800", color: "#0f172a" },
    text: { margin: "0 0 12px", fontSize: "0.72rem", color: "#475569", lineHeight: 1.5 },
    btn: {
        display: "inline-block", background: "#2563eb", color: "#fff", fontWeight: "700",
        fontSize: "0.72rem", padding: "8px 16px", borderRadius: "6px", marginBottom: "12px",
    },
    hint: { margin: 0, fontSize: "0.66rem", color: "#64748b" },
};
