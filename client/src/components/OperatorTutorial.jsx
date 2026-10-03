import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { completeTutorial as completeTutorialAPI } from "../api/index.js";

export function useOperatorTutorial() {
    const { user, token, updateUser } = useAuth();
    const [show, setShow] = useState(false);

    useEffect(() => {
        if (!user) return;
        if (user.role === "operator" && !user.tutorialDone) setShow(true);
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

const STEPS = [
    {
        title: "¡Bienvenido a SLC Turnos!",
        desc: (name) => `Hola${name ? `, ${name.split(" ")[0]}` : ""}. Esta app te permite ver los turnos disponibles, solicitar los que te interesen y hacer seguimiento a tus asignaciones. En los próximos pasos te explicamos cómo funciona.`,
        Visual: VisualWelcome,
    },
    {
        title: "Las tarjetas de turno",
        desc: () => "Cada turno aparece como una tarjeta. El punto de color indica si es Diurno (🟡 amarillo) o Nocturno (🟣 morado). A la derecha ves cuántos cupos libres quedan.",
        Visual: VisualCard,
    },
    {
        title: "Solicitar un turno",
        desc: () => "Toca Solicitar en un turno disponible. Tu solicitud queda en estado Pendiente hasta que el supervisor la revise. Recibirás una notificación cuando sea aprobada o rechazada.",
        Visual: VisualRequest,
    },
    {
        title: "¿Ya no puedes ir? Desiste",
        desc: () => "Si tienes un turno aprobado pero no puedes asistir, toca Desistir. Puedes liberar tu cupo o pasárselo a un compañero. El supervisor revisará la solicitud.",
        Visual: VisualDesist,
    },
    {
        title: "El horario semanal",
        desc: () => "En la parte superior de cada vista encuentras un horario en tabla con todos los turnos de la semana y quién está asignado a cada uno. Úsalo para planificar.",
        Visual: VisualSchedule,
    },
];

export default function OperatorTutorial({ onComplete }) {
    const { user } = useAuth();
    const [step, setStep] = useState(0);
    const [canAdvance, setCanAdvance] = useState(false);
    const [animDir, setAnimDir] = useState("in"); // "in" | "out-left" | "out-right"

    useEffect(() => {
        setCanAdvance(false);
        setAnimDir("in");
        const t = setTimeout(() => setCanAdvance(true), 2200);
        return () => clearTimeout(t);
    }, [step]);

    const isLast = step === STEPS.length - 1;
    const current = STEPS[step];
    const Visual = current.Visual;

    function goNext() {
        if (!canAdvance) return;
        if (isLast) { onComplete(); return; }
        setStep((s) => s + 1);
    }

    function goPrev() {
        if (step === 0) return;
        setStep((s) => s - 1);
    }

    return (
        <div style={s.overlay}>
            <div style={s.modal}>
                {/* Cabecera */}
                <div style={s.header}>
                    <span style={s.badge}>Tutorial</span>
                    <div style={s.dots}>
                        {STEPS.map((_, i) => (
                            <div
                                key={i}
                                style={{
                                    ...s.dot,
                                    background: i === step ? "#3b82f6" : i < step ? "#93c5fd" : "var(--card-border)",
                                    transform: i === step ? "scale(1.3)" : "scale(1)",
                                }}
                            />
                        ))}
                    </div>
                </div>

                {/* Contenido animado */}
                <div key={step} style={s.stepBody} className="tutorial-step-anim">
                    <div style={s.visualBox}>
                        <Visual />
                    </div>
                    <h2 style={s.title}>{current.title}</h2>
                    <p style={s.desc}>{current.desc(user?.name)}</p>
                </div>

                {/* Navegación */}
                <div style={s.navRow}>
                    {step > 0 ? (
                        <button style={s.backBtn} onClick={goPrev}>
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            Atrás
                        </button>
                    ) : (
                        <div />
                    )}
                    <button
                        style={{ ...s.nextBtn, ...(canAdvance ? {} : s.nextBtnDisabled) }}
                        onClick={goNext}
                        disabled={!canAdvance}
                    >
                        {!canAdvance
                            ? "Un momento…"
                            : isLast
                                ? "¡Empezar!"
                                : "Siguiente →"}
                    </button>
                </div>

                <p style={s.stepLabel}>Paso {step + 1} de {STEPS.length}</p>
            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────
   Visuales interactivas por paso
───────────────────────────────────────────── */

function VisualWelcome() {
    return (
        <div style={v.card}>
            <div style={{ textAlign: "center", padding: "8px 0" }}>
                <div style={v.appLogo}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                </div>
                <div style={v.logoTitle}>SLC Turnos</div>
                <div style={v.logoSub}>Gestión de turnos para operadores</div>
                <div style={{ marginTop: "14px", display: "flex", justifyContent: "center", gap: "8px", flexWrap: "wrap" }}>
                    {[
                        { icon: "📅", label: "Ver turnos" },
                        { icon: "✋", label: "Solicitar" },
                        { icon: "🔔", label: "Notificaciones" },
                    ].map(({ icon, label }) => (
                        <div key={label} style={v.chip}>
                            <span style={{ fontSize: "1rem" }}>{icon}</span>
                            <span style={{ fontSize: "0.68rem", color: "#94a3b8", fontWeight: "600" }}>{label}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function VisualCard() {
    return (
        <div style={v.card}>
            <div style={{ fontSize: "0.6rem", color: "#475569", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>Tarjeta de turno</div>
            {/* Turno diurno */}
            <div style={{ ...v.shiftRow, borderLeft: "4px solid transparent" }}>
                <div style={{ ...v.typeDot, background: "#f59e0b" }} title="Diurno" />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={v.shiftName}>Diurno - Lunes</div>
                    <div style={v.shiftMeta}>lun., 1 sep. · 7:30am – 4:30pm</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                    <span style={{ ...v.pill, color: "#64748b" }}>2 cupos libres</span>
                    <div style={v.requestBtn}>Solicitar</div>
                </div>
            </div>
            {/* Turno nocturno aprobado */}
            <div style={{ ...v.shiftRow, borderLeft: "4px solid #16a34a" }}>
                <div style={{ ...v.typeDot, background: "#6366f1" }} title="Nocturno" />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={v.shiftName}>Nocturno - Martes</div>
                    <div style={v.shiftMeta}>mar., 2 sep. · 11:00pm – 6:00am</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                    <span style={{ ...v.pill, color: "#22c55e" }}>Aprobado ✓</span>
                    <div style={{ ...v.requestBtn, background: "#ef4444" }}>Desistir</div>
                </div>
            </div>
            {/* Leyenda */}
            <div style={{ display: "flex", gap: "12px", marginTop: "4px" }}>
                <div style={v.legend}><div style={{ ...v.typeDot, background: "#f59e0b", marginTop: 0 }} /><span>Diurno</span></div>
                <div style={v.legend}><div style={{ ...v.typeDot, background: "#6366f1", marginTop: 0 }} /><span>Nocturno</span></div>
            </div>
        </div>
    );
}

function VisualRequest() {
    const [phase, setPhase] = useState(0); // 0=disponible, 1=pendiente, 2=aprobado
    useEffect(() => {
        const t1 = setTimeout(() => setPhase(1), 1000);
        const t2 = setTimeout(() => setPhase(2), 2400);
        const t3 = setTimeout(() => setPhase(0), 4000);
        return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }, []);

    const states = [
        { label: "2 cupos libres", labelColor: "#64748b", btn: "Solicitar", btnColor: "#2563eb", border: "transparent" },
        { label: "1° en la fila", labelColor: "#f59e0b", btn: "Cancelar", btnColor: "#ef4444", border: "#f59e0b" },
        { label: "Aprobado ✓", labelColor: "#22c55e", btn: "Desistir", btnColor: "#ef4444", border: "#16a34a" },
    ];
    const cur = states[phase];

    return (
        <div style={v.card}>
            <div style={{ fontSize: "0.6rem", color: "#475569", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>Ciclo de una solicitud</div>
            <div style={{ ...v.shiftRow, borderLeft: `4px solid ${cur.border}`, transition: "border-color 0.4s ease" }}>
                <div style={{ ...v.typeDot, background: "#f59e0b" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={v.shiftName}>Diurno - Lunes</div>
                    <div style={v.shiftMeta}>7:30am – 4:30pm</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                    <span style={{ ...v.pill, color: cur.labelColor, transition: "color 0.4s" }}>{cur.label}</span>
                    <div style={{ ...v.requestBtn, background: cur.btnColor, transition: "background 0.4s" }}>{cur.btn}</div>
                </div>
            </div>
            {/* Barra de progreso de fases */}
            <div style={{ display: "flex", gap: "4px", marginTop: "6px" }}>
                {["Disponible", "Pendiente", "Aprobado"].map((l, i) => (
                    <div key={l} style={{ flex: 1, textAlign: "center" }}>
                        <div style={{
                            height: "3px", borderRadius: "2px", marginBottom: "3px",
                            background: i <= phase ? (i === 0 ? "#3b82f6" : i === 1 ? "#f59e0b" : "#22c55e") : "#1e293b",
                            transition: "background 0.4s",
                        }} />
                        <span style={{ fontSize: "0.55rem", color: i === phase ? "#e2e8f0" : "#475569", fontWeight: "700" }}>{l}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function VisualDesist() {
    const [open, setOpen] = useState(false);
    useEffect(() => {
        const t1 = setTimeout(() => setOpen(true), 800);
        const t2 = setTimeout(() => setOpen(false), 3500);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, []);

    return (
        <div style={v.card}>
            <div style={{ fontSize: "0.6rem", color: "#475569", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>Modal de desistimiento</div>
            {/* Tarjeta base */}
            <div style={{ ...v.shiftRow, borderLeft: "4px solid #16a34a", opacity: open ? 0.4 : 1, transition: "opacity 0.3s" }}>
                <div style={{ ...v.typeDot, background: "#f59e0b" }} />
                <div style={{ flex: 1 }}>
                    <div style={v.shiftName}>Diurno - Viernes</div>
                    <div style={v.shiftMeta}>7:30am – 4:30pm · Aprobado ✓</div>
                </div>
                <div style={{ ...v.requestBtn, background: "#ef4444", fontSize: "0.65rem" }}>Desistir</div>
            </div>
            {/* Modal animado */}
            <div style={{
                background: "#1e293b", borderRadius: "10px", border: "1px solid #334155",
                padding: "12px", display: "flex", flexDirection: "column", gap: "8px",
                transform: open ? "scale(1)" : "scale(0.92)", opacity: open ? 1 : 0,
                transition: "all 0.3s ease",
            }}>
                <div style={{ fontSize: "0.78rem", fontWeight: "800", color: "#e2e8f0" }}>Desistir del turno</div>
                <div style={{ fontSize: "0.64rem", color: "#64748b" }}>Diurno - Viernes</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div style={{ ...v.desistOption, background: "#2563eb" }}>Pasar el turno a un compañero</div>
                    <div style={{ ...v.desistOption, background: "#ef4444" }}>Solo liberar mi cupo</div>
                    <div style={{ ...v.desistOption, background: "#334155", color: "#94a3b8" }}>Volver</div>
                </div>
            </div>
        </div>
    );
}

function VisualSchedule() {
    const days = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const data = [
        { type: "D", times: ["Juan D.", "", "Sara L.", "Juan D.", "", "María P."] },
        { type: "N", times: ["", "Pedro R.", "", "", "Ana G.", ""] },
    ];
    return (
        <div style={v.card}>
            <div style={{ fontSize: "0.6rem", color: "#475569", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>Vista de horario semanal</div>
            <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.6rem" }}>
                    <thead>
                        <tr>
                            <th style={v.th}></th>
                            {days.map((d) => <th key={d} style={v.th}>{d}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row) => (
                            <tr key={row.type}>
                                <td style={{ ...v.td, fontWeight: "700", color: row.type === "D" ? "#f59e0b" : "#818cf8" }}>
                                    {row.type === "D" ? "☀" : "🌙"}
                                </td>
                                {row.times.map((name, i) => (
                                    <td key={i} style={v.td}>
                                        {name
                                            ? <span style={{ background: "#1e3a5f", color: "#93c5fd", padding: "2px 5px", borderRadius: "4px", whiteSpace: "nowrap" }}>{name}</span>
                                            : <span style={{ color: "#334155" }}>—</span>
                                        }
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div style={{ fontSize: "0.6rem", color: "#475569", marginTop: "4px", textAlign: "center" }}>Toca cualquier celda para ver detalles del turno</div>
        </div>
    );
}

/* ─────────────────────────────────────────────
   Estilos
───────────────────────────────────────────── */

const s = {
    overlay: {
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 10000, backdropFilter: "blur(6px)",
    },
    modal: {
        background: "var(--card-bg)", borderRadius: "20px",
        padding: "28px 26px 22px", width: "100%", maxWidth: "460px",
        margin: "0 16px", boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: "16px", textAlign: "center",
        maxHeight: "92dvh", overflowY: "auto",
    },
    header: {
        display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", width: "100%",
    },
    badge: {
        background: "var(--primary-muted,#dbeafe)", color: "var(--primary,#1e3a5f)",
        fontSize: "0.7rem", fontWeight: "700", padding: "4px 14px",
        borderRadius: "999px", letterSpacing: "0.05em", textTransform: "uppercase",
    },
    dots: { display: "flex", gap: "6px", alignItems: "center" },
    dot: {
        width: "8px", height: "8px", borderRadius: "50%",
        transition: "background 0.3s, transform 0.3s",
    },
    stepBody: { width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" },
    visualBox: { width: "100%" },
    title: { margin: 0, fontSize: "1.18rem", fontWeight: "800", color: "var(--text-main)", lineHeight: 1.3 },
    desc: { margin: 0, fontSize: "0.875rem", color: "var(--text-muted)", lineHeight: 1.65, maxWidth: "390px" },
    navRow: { display: "flex", gap: "10px", width: "100%", alignItems: "center", justifyContent: "space-between" },
    backBtn: {
        background: "transparent", border: "1.5px solid var(--card-border)", color: "var(--text-muted)",
        padding: "10px 16px", borderRadius: "10px", fontSize: "0.875rem", fontWeight: "600",
        cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap",
    },
    nextBtn: {
        flex: 1, background: "#3b82f6", color: "#fff", border: "none",
        padding: "12px 20px", borderRadius: "10px", fontSize: "0.9rem", fontWeight: "700",
        cursor: "pointer", transition: "background 0.2s",
    },
    nextBtnDisabled: { background: "var(--hover-overlay,#e2e8f0)", color: "var(--text-muted)", cursor: "not-allowed" },
    stepLabel: { margin: 0, fontSize: "0.72rem", color: "var(--text-muted)" },
};

/* Visuales — contenedor oscuro compartido */
const v = {
    card: {
        background: "#0f172a", borderRadius: "12px", padding: "14px",
        display: "flex", flexDirection: "column", gap: "8px",
        border: "1px solid #1e293b", textAlign: "left",
    },
    appLogo: {
        width: "52px", height: "52px", borderRadius: "14px",
        background: "#1e293b", border: "1px solid #334155",
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 8px",
    },
    logoTitle: { fontSize: "0.95rem", fontWeight: "800", color: "#f1f5f9" },
    logoSub: { fontSize: "0.65rem", color: "#64748b", marginTop: "2px" },
    chip: {
        background: "#1e293b", border: "1px solid #334155", borderRadius: "8px",
        padding: "6px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: "3px",
    },
    shiftRow: {
        display: "flex", alignItems: "center", gap: "10px",
        background: "#1e293b", borderRadius: "8px", padding: "8px 10px",
        border: "1px solid #334155",
    },
    typeDot: { width: "9px", height: "9px", borderRadius: "50%", flexShrink: 0, marginTop: "3px" },
    shiftName: { fontSize: "0.78rem", fontWeight: "700", color: "#f1f5f9", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
    shiftMeta: { fontSize: "0.63rem", color: "#64748b", marginTop: "2px" },
    pill: { fontSize: "0.65rem", fontWeight: "700", padding: "2px 8px", borderRadius: "999px" },
    requestBtn: {
        background: "#2563eb", color: "#fff", borderRadius: "6px",
        padding: "4px 10px", fontSize: "0.66rem", fontWeight: "700", whiteSpace: "nowrap",
    },
    legend: { display: "flex", alignItems: "center", gap: "5px", fontSize: "0.62rem", color: "#64748b" },
    desistOption: {
        borderRadius: "6px", padding: "7px 10px",
        fontSize: "0.68rem", fontWeight: "700", color: "#fff", textAlign: "center",
    },
    th: {
        padding: "3px 5px", color: "#475569", fontSize: "0.6rem", fontWeight: "700",
        textAlign: "center", borderBottom: "1px solid #1e293b",
    },
    td: { padding: "4px 5px", textAlign: "center", borderBottom: "1px solid #0f172a" },
};
