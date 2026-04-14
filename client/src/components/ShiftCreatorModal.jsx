import { useState } from "react";
import { createShift } from "../api/index.js";

const WEEK_DAYS = [
    { offset: 0, short: "L", full: "Lunes" },
    { offset: 1, short: "M", full: "Martes" },
    { offset: 2, short: "X", full: "Miércoles" },
    { offset: 3, short: "J", full: "Jueves" },
    { offset: 4, short: "V", full: "Viernes" },
    { offset: 5, short: "S", full: "Sábado" },
];

function getMondayIso(isoDate) {
    const [y, m, d] = isoDate.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const dow = (date.getDay() + 6) % 7; // Lun=0
    date.setDate(date.getDate() - dow);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDaysToIso(isoDate, days) {
    const [y, m, d] = isoDate.split("-").map(Number);
    const date = new Date(y, m - 1, d + days);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Convierte formato 24h a 12h: "07:30" → "7:30am", "23:00" → "11:00pm"
function formatTime(t) {
    if (!t) return t;
    const [h, mi] = t.split(":").map(Number);
    const ampm = h >= 12 ? "pm" : "am";
    const hour = h % 12 || 12;
    return `${hour}:${String(mi).padStart(2, "0")}${ampm}`;
}

function getWeekLabel(mondayIso) {
    const [y, m, d] = mondayIso.split("-").map(Number);
    const mon = new Date(y, m - 1, d);
    const sun = new Date(y, m - 1, d + 6);
    const fmt = (dt) => dt.toLocaleDateString("es-CO", { month: "short", day: "numeric" });
    return `${fmt(mon)} – ${fmt(sun)}`;
}

function todayMondayIso() {
    const today = new Date();
    today.setDate(today.getDate() + 7);
    return getMondayIso(today.toISOString().slice(0, 10));
}

function ToggleSwitch({ checked, onChange, colorOn }) {
    return (
        <div
            style={{ ...s.toggleTrack, background: checked ? colorOn : "#d1d5db" }}
            onClick={() => onChange(!checked)}
        >
            <div style={{ ...s.toggleThumb, left: checked ? "18px" : "2px" }} />
        </div>
    );
}

function SlotCounter({ value, onChange }) {
    return (
        <div style={s.slotsCtrl}>
            <button type="button" style={s.slotBtn} onClick={() => onChange(Math.max(1, value - 1))}>−</button>
            <span style={s.slotNum}>{value}</span>
            <button type="button" style={s.slotBtn} onClick={() => onChange(value + 1)}>+</button>
        </div>
    );
}

function ShiftCreatorModal({ token, onClose, onCreated }) {
    const [mode, setMode] = useState("week");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // Modo semana
    const [mondayIso, setMondayIso] = useState(todayMondayIso);
    const [selectedDays, setSelectedDays] = useState([0, 1, 2, 3, 4, 5]);
    const [dayPreset, setDayPreset] = useState({ enabled: true, start: "07:30", end: "16:30", slots: 3 });
    const [nightPreset, setNightPreset] = useState({ enabled: false, start: "23:00", end: "06:00", slots: 3 });

    // Modo individual
    const [single, setSingle] = useState({
        title: "", date: "", startTime: "07:30", endTime: "16:30", type: "DAY", totalSlots: 1,
    });

    function toggleDay(offset) {
        setSelectedDays((prev) =>
            prev.includes(offset)
                ? prev.filter((d) => d !== offset)
                : [...prev, offset].sort((a, b) => a - b)
        );
    }

    const enabledTypeCount =
        (dayPreset.enabled ? 1 : 0) + (nightPreset.enabled ? 1 : 0);
    const totalToCreate = selectedDays.length * enabledTypeCount;

    async function handleBulkCreate() {
        if (totalToCreate === 0) {
            setError("Selecciona al menos un día y activa al menos un tipo de turno.");
            return;
        }
        setLoading(true);
        setError("");
        try {
            const tasks = [];
            for (const offset of selectedDays) {
                const date = addDaysToIso(mondayIso, offset);
                const { full } = WEEK_DAYS[offset];
                if (dayPreset.enabled) {
                    tasks.push(createShift(token, {
                        title: `Diurno - ${full}`,
                        date,
                        startTime: formatTime(dayPreset.start),
                        endTime: formatTime(dayPreset.end),
                        type: "DAY",
                        totalSlots: Number(dayPreset.slots),
                    }));
                }
                if (nightPreset.enabled) {
                    tasks.push(createShift(token, {
                        title: `Nocturno - ${full}`,
                        date,
                        startTime: formatTime(nightPreset.start),
                        endTime: formatTime(nightPreset.end),
                        type: "NIGHT",
                        totalSlots: Number(nightPreset.slots),
                    }));
                }
            }
            await Promise.all(tasks);
            onCreated(`${tasks.length} turno${tasks.length !== 1 ? "s" : ""} creado${tasks.length !== 1 ? "s" : ""} exitosamente`);
            onClose();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleSingleCreate(e) {
        e.preventDefault();
        setLoading(true);
        setError("");
        try {
            await createShift(token, {
                ...single,
                startTime: formatTime(single.startTime),
                endTime: formatTime(single.endTime),
            });
            onCreated("Turno creado exitosamente");
            onClose();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div style={s.overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
            <div style={s.modal}>
                <div style={s.modalHeader} className="modal-header">
                    <div>
                        <h2 style={s.modalTitle}>Crear turnos</h2>
                        <p style={s.modalSubtitle}>
                            {mode === "week"
                                ? "Crea múltiples turnos para una semana completa de una vez"
                                : "Crea un turno individual con ajustes personalizados"}
                        </p>
                    </div>
                    <button style={s.closeBtn} onClick={onClose}>✕</button>
                </div>

                {/* Pestañas de modo */}
                <div style={s.modeTabs} className="modal-tabs">
                    <button
                        style={{ ...s.modeTab, ...(mode === "week" ? s.modeTabActive : {}) }}
                        onClick={() => { setMode("week"); setError(""); }}
                    >
                        📅 Por semana
                    </button>
                    <button
                        style={{ ...s.modeTab, ...(mode === "single" ? s.modeTabActive : {}) }}
                        onClick={() => { setMode("single"); setError(""); }}
                    >
                        ➕ Individual
                    </button>
                </div>

                {error && <div style={s.errorBox} className="modal-error">⚠️ {error}</div>}

                {/* Semana completa */}
                {mode === "week" && (
                    <div style={s.body} className="modal-body">
                        {/* Selector de semana */}
                        <div style={s.row}>
                            <div style={s.fieldGroup}>
                                <label style={s.fieldLabel}>Semana</label>
                                <input
                                    type="date"
                                    style={s.input}
                                    value={mondayIso}
                                    onChange={(e) => e.target.value && setMondayIso(getMondayIso(e.target.value))}
                                />
                            </div>
                            <div style={s.weekLabelBox}>
                                <span style={s.weekLabelText}>📆 {getWeekLabel(mondayIso)}</span>
                            </div>
                        </div>

                        {/* Selector de días */}
                        <div style={s.fieldGroup}>
                            <div style={s.labelRow}>
                                <label style={s.fieldLabel}>Días</label>
                                <div style={s.quickLinks}>
                                    <button style={s.quickLink} onClick={() => setSelectedDays([0,1,2,3,4,5])}>Todos</button>
                                    <span style={s.quickLinkDot}>·</span>
                                    <button style={s.quickLink} onClick={() => setSelectedDays([5])}>Solo sábado</button>
                                    <span style={s.quickLinkDot}>·</span>
                                    <button style={s.quickLink} onClick={() => setSelectedDays([])}>Ninguno</button>
                                </div>
                            </div>
                            <div style={s.dayRow}>
                                {WEEK_DAYS.map(({ offset, short, full }) => {
                                    const active = selectedDays.includes(offset);
                                    return (
                                        <button
                                            key={offset}
                                            title={full}
                                            style={{ ...s.dayBtn, ...(active ? s.dayBtnActive : {}) }}
                                            onClick={() => toggleDay(offset)}
                                        >
                                            {short}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Tarjetas de tipo de turno */}
                        <div style={s.fieldGroup}>
                            <label style={s.fieldLabel}>Tipos de turno</label>
                            <div style={s.presetCards} className="modal-preset-cards">
                                {/* Turno diurno */}
                                <div style={s.presetCard} className={dayPreset.enabled ? "preset-card-day" : ""}>
                                    <div style={s.presetHeader}>
                                        <span style={s.presetIcon}>☀️</span>
                                        <span style={s.presetName}>Diurno</span>
                                        <ToggleSwitch
                                            checked={dayPreset.enabled}
                                            onChange={(v) => setDayPreset({ ...dayPreset, enabled: v })}
                                            colorOn="#f59e0b"
                                        />
                                    </div>
                                    <div style={{ ...s.presetFields, ...(dayPreset.enabled ? {} : s.presetFieldsDisabled) }}>
                                        <div style={s.presetField}>
                                            <label style={s.presetFieldLabel}>Inicio</label>
                                            <input
                                                type="time"
                                                style={s.timeInput}
                                                value={dayPreset.start}
                                                disabled={!dayPreset.enabled}
                                                onChange={(e) => setDayPreset({ ...dayPreset, start: e.target.value })}
                                            />
                                        </div>
                                        <div style={s.presetField}>
                                            <label style={s.presetFieldLabel}>Fin</label>
                                            <input
                                                type="time"
                                                style={s.timeInput}
                                                value={dayPreset.end}
                                                disabled={!dayPreset.enabled}
                                                onChange={(e) => setDayPreset({ ...dayPreset, end: e.target.value })}
                                            />
                                        </div>
                                        <div style={s.presetField}>
                                            <label style={s.presetFieldLabel}>Cupos</label>
                                            <SlotCounter
                                                value={dayPreset.slots}
                                                onChange={(v) => setDayPreset({ ...dayPreset, slots: v })}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Turno nocturno */}
                                <div style={s.presetCard} className={nightPreset.enabled ? "preset-card-night" : ""}>
                                    <div style={s.presetHeader}>
                                        <span style={s.presetIcon}>🌙</span>
                                        <span style={s.presetName}>Nocturno</span>
                                        <ToggleSwitch
                                            checked={nightPreset.enabled}
                                            onChange={(v) => setNightPreset({ ...nightPreset, enabled: v })}
                                            colorOn="#6366f1"
                                        />
                                    </div>
                                    <div style={{ ...s.presetFields, ...(nightPreset.enabled ? {} : s.presetFieldsDisabled) }}>
                                        <div style={s.presetField}>
                                            <label style={s.presetFieldLabel}>Inicio</label>
                                            <input
                                                type="time"
                                                style={s.timeInput}
                                                value={nightPreset.start}
                                                disabled={!nightPreset.enabled}
                                                onChange={(e) => setNightPreset({ ...nightPreset, start: e.target.value })}
                                            />
                                        </div>
                                        <div style={s.presetField}>
                                            <label style={s.presetFieldLabel}>Fin</label>
                                            <input
                                                type="time"
                                                style={s.timeInput}
                                                value={nightPreset.end}
                                                disabled={!nightPreset.enabled}
                                                onChange={(e) => setNightPreset({ ...nightPreset, end: e.target.value })}
                                            />
                                        </div>
                                        <div style={s.presetField}>
                                            <label style={s.presetFieldLabel}>Cupos</label>
                                            <SlotCounter
                                                value={nightPreset.slots}
                                                onChange={(v) => setNightPreset({ ...nightPreset, slots: v })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Vista previa de turnos a crear */}
                        {totalToCreate > 0 ? (
                            <div style={s.preview}>
                                <span style={s.previewCount}>
                                    {totalToCreate} turno{totalToCreate !== 1 ? "s" : ""}
                                </span>
                                <span style={s.previewDesc}>
                                    {selectedDays.map((o) => WEEK_DAYS[o].short).join(" · ")}
                                    {enabledTypeCount === 2 ? " · ☀️ + 🌙" : dayPreset.enabled ? " · ☀️" : " · 🌙"}
                                </span>
                            </div>
                        ) : (
                            <div style={s.previewEmpty}>
                                Selecciona días y activa al menos un tipo de turno para previsualizar
                            </div>
                        )}

                        {/* Botones de acción */}
                        <div style={s.footer} className="modal-footer">
                            <button style={s.cancelBtn} onClick={onClose} disabled={loading}>
                                Cancelar
                            </button>
                            <button
                                style={{
                                    ...s.submitBtn,
                                    ...(loading || totalToCreate === 0 ? s.submitBtnDisabled : {}),
                                }}
                                onClick={handleBulkCreate}
                                disabled={loading || totalToCreate === 0}
                            >
                                {loading
                                    ? "Creando..."
                                    : totalToCreate > 0
                                        ? `✓ Crear ${totalToCreate} turno${totalToCreate !== 1 ? "s" : ""}`
                                        : "Crear turnos"}
                            </button>
                        </div>
                    </div>
                )}

                {/* Turno individual */}
                {mode === "single" && (
                    <form style={s.body} className="modal-body" onSubmit={handleSingleCreate}>
                        <div style={s.singleGrid} className="modal-single-grid">
                            <div style={{ ...s.fieldGroup, gridColumn: "1 / -1" }}>
                                <label style={s.fieldLabel}>Título</label>
                                <input
                                    style={s.input}
                                    placeholder="Ej: Turno noche sábado"
                                    value={single.title}
                                    onChange={(e) => setSingle({ ...single, title: e.target.value })}
                                    required
                                />
                            </div>
                            <div style={s.fieldGroup}>
                                <label style={s.fieldLabel}>Fecha</label>
                                <input
                                    type="date"
                                    style={s.input}
                                    value={single.date}
                                    onChange={(e) => setSingle({ ...single, date: e.target.value })}
                                    required
                                />
                            </div>
                            <div style={s.fieldGroup}>
                                <label style={s.fieldLabel}>Tipo</label>
                                <select
                                    style={s.input}
                                    value={single.type}
                                    onChange={(e) => setSingle({ ...single, type: e.target.value })}
                                >
                                    <option value="DAY">☀️ Diurno</option>
                                    <option value="NIGHT">🌙 Nocturno</option>
                                </select>
                            </div>
                            <div style={s.fieldGroup}>
                                <label style={s.fieldLabel}>Inicio</label>
                                <input
                                    type="time"
                                    style={s.input}
                                    value={single.startTime}
                                    onChange={(e) => setSingle({ ...single, startTime: e.target.value })}
                                    required
                                />
                            </div>
                            <div style={s.fieldGroup}>
                                <label style={s.fieldLabel}>Fin</label>
                                <input
                                    type="time"
                                    style={s.input}
                                    value={single.endTime}
                                    onChange={(e) => setSingle({ ...single, endTime: e.target.value })}
                                    required
                                />
                            </div>
                            <div style={s.fieldGroup}>
                                <label style={s.fieldLabel}>Cupos</label>
                                <SlotCounter
                                    value={single.totalSlots}
                                    onChange={(v) => setSingle({ ...single, totalSlots: v })}
                                />
                            </div>
                        </div>
                        <div style={s.footer} className="modal-footer">
                            <button type="button" style={s.cancelBtn} onClick={onClose} disabled={loading}>
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                style={{ ...s.submitBtn, ...(loading ? s.submitBtnDisabled : {}) }}
                                disabled={loading}
                            >
                                {loading ? "Creando..." : "✓ Crear turno"}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}

const s = {
    overlay: {
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "16px",
    },
    modal: {
        background: "var(--card-bg)",
        borderRadius: "20px",
        width: "100%",
        maxWidth: "580px",
        maxHeight: "92dvh",
        overflowY: "auto",
        boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
    },
    modalHeader: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        padding: "24px 24px 0",
    },
    modalTitle: { margin: 0, fontSize: "1.25rem", fontWeight: "800", color: "var(--text-main)" },
    modalSubtitle: { margin: "4px 0 0", fontSize: "0.82rem", color: "var(--text-muted)" },
    closeBtn: {
        background: "var(--hover-overlay)",
        border: "none",
        borderRadius: "8px",
        width: "32px",
        height: "32px",
        cursor: "pointer",
        fontSize: "1rem",
        color: "var(--text-muted)",
        fontWeight: "700",
        flexShrink: 0,
        marginTop: "2px",
    },
    modeTabs: {
        display: "flex",
        gap: "6px",
        padding: "16px 24px 0",
    },
    modeTab: {
        padding: "8px 16px",
        borderRadius: "10px",
        border: "1.5px solid var(--border-color)",
        background: "transparent",
        color: "var(--text-muted)",
        cursor: "pointer",
        fontWeight: "600",
        fontSize: "0.85rem",
    },
    modeTabActive: {
        background: "#2563eb",
        border: "1.5px solid #2563eb",
        color: "#ffffff",
    },
    errorBox: {
        margin: "12px 24px 0",
        background: "var(--danger-bg)",
        color: "var(--danger)",
        padding: "10px 14px",
        borderRadius: "10px",
        fontSize: "0.85rem",
        fontWeight: "600",
    },
    body: {
        padding: "20px 24px 24px",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
    },
    row: {
        display: "flex",
        gap: "14px",
        alignItems: "flex-end",
        flexWrap: "wrap",
    },
    weekLabelBox: {
        flex: 1,
        minWidth: "160px",
        paddingBottom: "2px",
    },
    weekLabelText: {
        color: "var(--text-muted)",
        fontSize: "0.88rem",
        fontWeight: "600",
    },
    fieldGroup: {
        display: "flex",
        flexDirection: "column",
        gap: "6px",
    },
    labelRow: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
    },
    fieldLabel: {
        fontSize: "0.8rem",
        fontWeight: "700",
        color: "var(--text-main)",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
    },
    quickLinks: {
        display: "flex",
        alignItems: "center",
        gap: "4px",
    },
    quickLink: {
        background: "none",
        border: "none",
        color: "var(--primary)",
        cursor: "pointer",
        fontSize: "0.78rem",
        fontWeight: "600",
        padding: "0 2px",
    },
    quickLinkDot: { color: "var(--border-color)", fontSize: "0.75rem" },
    dayRow: {
        display: "flex",
        gap: "8px",
        flexWrap: "wrap",
    },
    dayBtn: {
        width: "44px",
        height: "44px",
        borderRadius: "12px",
        border: "2px solid var(--border-color)",
        background: "var(--bg-color)",
        color: "var(--text-muted)",
        cursor: "pointer",
        fontWeight: "800",
        fontSize: "0.9rem",
        transition: "all 0.15s",
    },
    dayBtnActive: {
        background: "#2563eb",
        border: "2px solid #2563eb",
        color: "#ffffff",
    },
    presetCards: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "12px",
    },
    presetCard: {
        border: "2px solid var(--border-color)",
        borderRadius: "14px",
        padding: "14px",
        background: "var(--bg-color)",
        transition: "border-color 0.2s, background 0.2s",
    },
    presetCardDay: {},
    presetCardNight: {},
    presetHeader: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        marginBottom: "12px",
    },
    presetIcon: { fontSize: "1.1rem" },
    presetName: {
        fontWeight: "700",
        fontSize: "0.9rem",
        color: "var(--text-main)",
        flex: 1,
    },
    presetFields: {
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        transition: "opacity 0.2s",
    },
    presetFieldsDisabled: { opacity: 0.4, pointerEvents: "none" },
    presetField: {
        display: "flex",
        flexDirection: "column",
        gap: "4px",
    },
    presetFieldLabel: {
        fontSize: "0.72rem",
        fontWeight: "700",
        color: "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
    },
    timeInput: {
        padding: "7px 10px",
        border: "1.5px solid var(--border-color)",
        borderRadius: "8px",
        fontSize: "0.88rem",
        outline: "none",
        width: "100%",
        boxSizing: "border-box",
        background: "var(--input-bg)",
        color: "var(--text-main)",
    },
    // Interruptor
    toggleTrack: {
        width: "38px",
        height: "22px",
        borderRadius: "999px",
        position: "relative",
        cursor: "pointer",
        transition: "background 0.2s",
        flexShrink: 0,
    },
    toggleThumb: {
        position: "absolute",
        top: "3px",
        width: "16px",
        height: "16px",
        borderRadius: "50%",
        background: "#ffffff",
        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        transition: "left 0.2s",
    },
    // Contador de cupos
    slotsCtrl: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
    },
    slotBtn: {
        width: "30px",
        height: "30px",
        borderRadius: "8px",
        border: "1.5px solid var(--border-color)",
        background: "var(--input-bg)",
        color: "var(--text-main)",
        cursor: "pointer",
        fontWeight: "800",
        fontSize: "1rem",
        lineHeight: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
    },
    slotNum: {
        minWidth: "28px",
        textAlign: "center",
        fontWeight: "800",
        fontSize: "1rem",
        color: "var(--text-main)",
    },
    // Vista previa
    preview: {
        background: "var(--success-bg)",
        border: "1.5px solid var(--success)",
        borderRadius: "12px",
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        flexWrap: "wrap",
    },
    previewCount: {
        background: "#16a34a",
        color: "#ffffff",
        fontWeight: "800",
        fontSize: "0.88rem",
        padding: "4px 12px",
        borderRadius: "999px",
        whiteSpace: "nowrap",
    },
    previewDesc: {
        color: "var(--success)",
        fontSize: "0.85rem",
        fontWeight: "600",
    },
    previewEmpty: {
        color: "var(--text-muted)",
        fontSize: "0.83rem",
        textAlign: "center",
        padding: "10px 0",
        fontStyle: "italic",
    },
    // Pie del modal
    footer: {
        display: "flex",
        gap: "10px",
        justifyContent: "flex-end",
        borderTop: "1px solid var(--border-color)",
        paddingTop: "16px",
        marginTop: "4px",
    },
    cancelBtn: {
        background: "var(--hover-overlay)",
        color: "var(--text-main)",
        border: "none",
        padding: "10px 18px",
        borderRadius: "10px",
        cursor: "pointer",
        fontWeight: "700",
        fontSize: "0.9rem",
    },
    submitBtn: {
        background: "#2563eb",
        color: "#ffffff",
        border: "none",
        padding: "10px 22px",
        borderRadius: "10px",
        cursor: "pointer",
        fontWeight: "700",
        fontSize: "0.9rem",
    },
    submitBtnDisabled: {
        background: "#93c5fd",
        cursor: "not-allowed",
    },
    // Cuadrícula modo individual
    singleGrid: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "16px",
    },
    input: {
        padding: "9px 12px",
        border: "1.5px solid var(--border-color)",
        borderRadius: "9px",
        fontSize: "0.9rem",
        outline: "none",
        width: "100%",
        boxSizing: "border-box",
        background: "var(--input-bg)",
        color: "var(--text-main)",
    },
};

export default ShiftCreatorModal;
