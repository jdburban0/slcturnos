import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import html2canvas from "html2canvas";
import { sendScheduleEmail, getOperators } from "../api/index.js";

const DAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function parseLocalDate(isoString) {
    const [y, m, d] = isoString.slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d);
}

function formatShortDate(isoString) {
    const d = parseLocalDate(isoString);
    return `${d.getDate()}-${d.toLocaleString("en-US", { month: "short" })}`;
}

function getDayName(isoString) {
    return DAYS_EN[parseLocalDate(isoString).getDay()];
}

function ordinal(n) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function getDateRange(shifts) {
    if (!shifts.length) return "";
    const dates = shifts.map((s) => parseLocalDate(s.date));
    const min = new Date(Math.min(...dates));
    const max = new Date(Math.max(...dates));
    const month = min.toLocaleString("en-US", { month: "long" });
    return `From ${month} ${ordinal(min.getDate())} to ${ordinal(max.getDate())}`;
}

function getWeekKey(isoString) {
    const d = parseLocalDate(isoString);
    const day = (d.getDay() + 6) % 7;
    const monday = new Date(d);
    monday.setDate(d.getDate() - day);
    return monday.toISOString().slice(0, 10);
}

export default function ScheduleTable({ shifts, updatedAt, canExport, token }) {
    const [flash, setFlash] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [weekIndex, setWeekIndex] = useState(0);

    useEffect(() => {
        setFlash(true);
        const t = setTimeout(() => setFlash(false), 1200);
        return () => clearTimeout(t);
    }, [updatedAt]);

    // Volver a la primera semana si cambian los turnos
    useEffect(() => { setWeekIndex(0); }, [shifts]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = shifts.filter((s) => parseLocalDate(s.date) >= today);

    if (!upcoming.length) return null;

    const weeksMap = {};
    for (const shift of upcoming) {
        const key = getWeekKey(shift.date);
        if (!weeksMap[key]) weeksMap[key] = [];
        weeksMap[key].push(shift);
    }

    const weeks = Object.entries(weeksMap).sort(([a], [b]) => a.localeCompare(b));
    const total = weeks.length;
    const safeIndex = Math.min(weekIndex, total - 1);
    const [currentKey, currentShifts] = weeks[safeIndex];

    return (
        <div style={{ ...styles.wrapper, ...(flash ? styles.wrapperFlash : {}) }} className="schedule-wrapper">
            <div style={styles.liveRow}>
                <span style={styles.liveTitle}>Schedule</span>
                <span style={styles.liveBadge}>● LIVE</span>
            </div>

            {/* Navegación entre semanas */}
            {total > 1 && (
                <div style={styles.weekNav} className="week-nav">
                    <button
                        style={{ ...styles.navBtn, ...(safeIndex === 0 ? styles.navBtnDisabled : {}) }}
                        onClick={() => setWeekIndex((i) => Math.max(0, i - 1))}
                        disabled={safeIndex === 0}
                    >
                        ← Anterior
                    </button>
                    <span style={styles.weekCounter}>
                        Semana {safeIndex + 1} de {total}
                    </span>
                    <button
                        style={{ ...styles.navBtn, ...(safeIndex === total - 1 ? styles.navBtnDisabled : {}) }}
                        onClick={() => setWeekIndex((i) => Math.min(total - 1, i + 1))}
                        disabled={safeIndex === total - 1}
                    >
                        Siguiente →
                    </button>
                </div>
            )}

            <WeekTable
                key={currentKey}
                shifts={currentShifts}
                canExport={canExport}
                exporting={exporting}
                setExporting={setExporting}
                token={token}
            />
        </div>
    );
}

function WeekTable({ shifts, canExport, exporting, setExporting, token }) {
    const tableRef = useRef(null);
    const [sending, setSending] = useState(false);
    const [sendMsg, setSendMsg] = useState("");
    const [showMsgForm, setShowMsgForm] = useState(false);
    const [customMessage, setCustomMessage] = useState("");
    const [operators, setOperators] = useState([]);
    const [selectedIds, setSelectedIds] = useState(null); // null = not loaded yet

    const dates = [...new Set(shifts.map((s) => s.date.slice(0, 10)))].sort();
    const dayShifts = shifts.filter((s) => s.type === "DAY");
    const nightShifts = shifts.filter((s) => s.type === "NIGHT");

    function getTimeRanges(group) {
        return [
            ...new Map(
                group.map((s) => [
                    `${s.startTime}||${s.endTime}`,
                    { start: s.startTime, end: s.endTime },
                ])
            ).values(),
        ];
    }

    function getCellData(timeStart, timeEnd, date) {
        const shift = shifts.find(
            (s) =>
                s.date.slice(0, 10) === date &&
                s.startTime === timeStart &&
                s.endTime === timeEnd
        );
        if (!shift) return null;
        const fromRequests = (shift.requests ?? [])
            .filter((r) => r.status === "APPROVED")
            .map((r) => r.user?.name ?? "");
        const fromManual = (shift.manualAssignments ?? []).map((a) => a.name);
        const approved = [...fromRequests, ...fromManual];
        return { approved, totalSlots: shift.totalSlots, isFull: shift.status === "FULL" };
    }

    const dayRanges = getTimeRanges(dayShifts);
    const nightRanges = getTimeRanges(nightShifts);
    const dateRange = getDateRange(shifts);

    async function handleExport() {
        if (!tableRef.current || exporting) return;
        setExporting(true);
        try {
            const canvas = await html2canvas(tableRef.current, {
                backgroundColor: "#ffffff",
                scale: 2,
                useCORS: true,
                logging: false,
            });
            const link = document.createElement("a");
            link.download = `SLC-Schedule-${dates[0]}.jpg`;
            link.href = canvas.toDataURL("image/jpeg", 0.95);
            link.click();
        } catch (err) {
            console.error("Export error:", err);
        } finally {
            setExporting(false);
        }
    }

    async function handleOpenSendForm() {
        if (sending) return;
        try {
            const all = await getOperators(token);
            const ops = all.filter((u) => u.role === "operator" && u.active);
            setOperators(ops);
            setSelectedIds(ops.map((o) => o.id));
        } catch { setOperators([]); setSelectedIds([]); }
        setShowMsgForm((v) => !v);
    }

    function toggleOperator(id) {
        setSelectedIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    }

    async function handleSendEmail() {
        if (!tableRef.current || sending) return;
        setSending(true);
        setSendMsg("");
        setShowMsgForm(false);
        try {
            const canvas = await html2canvas(tableRef.current, {
                backgroundColor: "#ffffff",
                scale: 3,
                useCORS: true,
                logging: false,
                onclone: (_doc, el) => {
                    el.style.overflow = "visible";
                    el.style.width = "900px";
                    el.style.borderRadius = "0";
                    const scrollDiv = el.querySelector("div + div");
                    if (scrollDiv) {
                        scrollDiv.style.overflowX = "visible";
                        scrollDiv.style.width = "900px";
                    }
                },
            });
            const imageBase64 = canvas.toDataURL("image/jpeg", 0.92).split(",")[1];
            const result = await sendScheduleEmail(token, imageBase64, dateRange, customMessage.trim() || null, selectedIds);
            setSendMsg(result.message);
            setCustomMessage("");
            setSelectedIds(null);
            setTimeout(() => setSendMsg(""), 4000);
        } catch (err) {
            setSendMsg("Error al enviar");
            setTimeout(() => setSendMsg(""), 4000);
        } finally {
            setSending(false);
        }
    }

    return (
        <div style={styles.tableBlock}>
            {canExport && (
                <div>
                    <div style={styles.exportRow}>
                        <button
                            style={{ ...styles.exportBtn, ...(exporting ? styles.exportBtnDisabled : {}) }}
                            onClick={handleExport}
                            disabled={exporting}
                        >
                            {exporting ? "Exportando..." : "⬇ Exportar JPG"}
                        </button>
                        <button
                            style={{ ...styles.exportBtn, ...(sending ? styles.exportBtnDisabled : {}), background: "#16a34a" }}
                            onClick={handleOpenSendForm}
                            disabled={sending}
                        >
                            {sending ? "Enviando..." : "📧 Enviar a operadores"}
                        </button>
                        {sendMsg && <span style={styles.sendMsg}>{sendMsg}</span>}
                    </div>

                    {showMsgForm && createPortal(
                        <div data-theme={document.documentElement.getAttribute("data-theme")} style={styles.modalOverlay} onClick={() => { setShowMsgForm(false); setCustomMessage(""); setSelectedIds(null); }}>
                            <div style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
                                <h3 style={styles.modalTitle}>📧 Enviar horario</h3>

                                <p style={styles.modalSub}>Selecciona los operadores que recibirán el correo</p>

                                <div style={styles.selectAllRow}>
                                    <label style={styles.selectAllLabel}>
                                        <input
                                            type="checkbox"
                                            checked={selectedIds?.length === operators.length}
                                            onChange={() => setSelectedIds(
                                                selectedIds?.length === operators.length ? [] : operators.map((o) => o.id)
                                            )}
                                            style={{ marginRight: "6px" }}
                                        />
                                        Seleccionar todos
                                    </label>
                                    <span style={styles.selectedCount}>{selectedIds?.length ?? 0} seleccionados</span>
                                </div>

                                <div style={styles.operatorList}>
                                    {operators.length === 0 && (
                                        <p style={{ color: "#94a3b8", fontSize: "0.85rem", margin: 0 }}>No hay operadores activos.</p>
                                    )}
                                    {operators.map((op) => (
                                        <label key={op.id} style={{
                                            ...styles.operatorItem,
                                            ...(selectedIds?.includes(op.id) ? styles.operatorItemSelected : {})
                                        }}>
                                            <input
                                                type="checkbox"
                                                checked={selectedIds?.includes(op.id) ?? false}
                                                onChange={() => toggleOperator(op.id)}
                                                style={{ marginRight: "10px", accentColor: "#16a34a" }}
                                            />
                                            <div style={{ flex: 1 }}>
                                                <div style={{ ...styles.operatorName, color: document.documentElement.getAttribute("data-theme") === "dark" ? "#f8fafc" : "#0f172a" }}>{op.name}</div>
                                                <div style={styles.operatorEmail}>{op.email}</div>
                                            </div>
                                        </label>
                                    ))}
                                </div>

                                <label style={styles.msgLabel}>Mensaje del correo</label>
                                <textarea
                                    style={styles.msgTextarea}
                                    rows={3}
                                    value={customMessage}
                                    onChange={(e) => setCustomMessage(e.target.value)}
                                />

                                <div style={styles.msgActions}>
                                    <button style={styles.msgCancel} onClick={() => { setShowMsgForm(false); setCustomMessage(""); setSelectedIds(null); }}>
                                        Cancelar
                                    </button>
                                    <button style={{ ...styles.msgSend, ...((!selectedIds?.length || sending || !customMessage.trim()) ? styles.msgSendDisabled : {}) }} onClick={handleSendEmail} disabled={sending || !selectedIds?.length || !customMessage.trim()}>
                                        {sending ? "Enviando..." : `Enviar a ${selectedIds?.length ?? 0} operador${selectedIds?.length !== 1 ? "es" : ""}`}
                                    </button>
                                </div>
                            </div>
                        </div>,
                        document.body
                    )}
                </div>
            )}

            {/* Captured area */}
            <div ref={tableRef} style={styles.captureArea}>
                <div style={styles.tableTitle}>
                    Early &amp; Late Shifts — {dateRange}
                </div>
                <div style={styles.scrollWrapper}>
                    <table style={styles.table}>
                        <thead>
                            <tr>
                                {dates.map((date) => (
                                    <th key={date} style={styles.thDay}>
                                        <div style={styles.dayName}>{getDayName(date)}</div>
                                        <div style={styles.dayDate}>{formatShortDate(date)}</div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {/* DAY rows */}
                            {dayRanges.map((tr) => (
                                <tr key={`day-${tr.start}`}>
                                    {dates.map((date) => {
                                        const cell = getCellData(tr.start, tr.end, date);
                                        return (
                                            <td key={date} style={styles.tdCell}>
                                                {cell ? (
                                                    <>
                                                        <div style={styles.timeInCell}>
                                                            {tr.start} - {tr.end}
                                                        </div>
                                                        {Array.from({ length: cell.totalSlots }, (_, i) =>
                                                            cell.approved[i] ? (
                                                                <div key={i} style={styles.operatorName}>
                                                                    {cell.approved[i]}
                                                                </div>
                                                            ) : (
                                                                <div key={i} style={styles.emptySlot}>
                                                                    {i + 1}
                                                                </div>
                                                            )
                                                        )}
                                                    </>
                                                ) : null}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}

                            {/* Separator between DAY and NIGHT */}
                            {dayRanges.length > 0 && nightRanges.length > 0 && (
                                <tr>
                                    <td
                                        colSpan={dates.length}
                                        style={styles.separator}
                                    />
                                </tr>
                            )}

                            {/* NIGHT rows */}
                            {nightRanges.map((tr) => (
                                <tr key={`night-${tr.start}`}>
                                    {dates.map((date) => {
                                        const cell = getCellData(tr.start, tr.end, date);
                                        return (
                                            <td key={date} style={styles.tdCell}>
                                                {cell ? (
                                                    <>
                                                        <div style={styles.timeInCell}>
                                                            {tr.start} - {tr.end}
                                                        </div>
                                                        {Array.from({ length: cell.totalSlots }, (_, i) =>
                                                            cell.approved[i] ? (
                                                                <div key={i} style={styles.operatorName}>
                                                                    {cell.approved[i]}
                                                                </div>
                                                            ) : (
                                                                <div key={i} style={styles.emptySlot}>
                                                                    {i + 1}
                                                                </div>
                                                            )
                                                        )}
                                                    </>
                                                ) : null}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

const styles = {
    wrapper: {
        background: "#ffffff",
        borderRadius: "16px",
        padding: "20px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
        marginBottom: "28px",
        transition: "box-shadow 0.4s",
    },
    wrapperFlash: {
        boxShadow: "0 0 0 3px #3b82f6, 0 4px 20px rgba(0,0,0,0.12)",
    },
    liveRow: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "16px",
    },
    liveTitle: {
        fontWeight: "800",
        fontSize: "1.05rem",
        color: "#0f172a",
    },
    liveBadge: {
        fontSize: "0.75rem",
        fontWeight: "700",
        color: "#16a34a",
        background: "#dcfce7",
        padding: "3px 10px",
        borderRadius: "999px",
    },
    weekNav: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "16px",
        marginBottom: "16px",
    },
    navBtn: {
        background: "#1e3a5f",
        color: "#ffffff",
        border: "none",
        padding: "7px 16px",
        borderRadius: "8px",
        cursor: "pointer",
        fontWeight: "700",
        fontSize: "0.82rem",
    },
    navBtnDisabled: {
        background: "#e2e8f0",
        color: "#94a3b8",
        cursor: "not-allowed",
    },
    weekCounter: {
        color: "#475569",
        fontSize: "0.85rem",
        fontWeight: "600",
        minWidth: "110px",
        textAlign: "center",
    },
    tableBlock: {
        marginBottom: "16px",
    },
    exportRow: {
        display: "flex",
        justifyContent: "flex-end",
        alignItems: "center",
        gap: "8px",
        marginBottom: "10px",
        flexWrap: "wrap",
    },
    sendMsg: {
        fontSize: "0.82rem",
        fontWeight: "600",
        color: "#16a34a",
    },
    exportBtn: {
        background: "#1e3a5f",
        color: "#ffffff",
        border: "none",
        padding: "8px 14px",
        borderRadius: "8px",
        cursor: "pointer",
        fontWeight: "700",
        fontSize: "0.82rem",
    },
    exportBtnDisabled: {
        background: "#94a3b8",
        cursor: "not-allowed",
    },
    modalOverlay: {
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
    },
    modalBox: {
        background: "var(--card-bg)",
        borderRadius: "16px",
        padding: "28px 28px 24px",
        width: "100%",
        maxWidth: "460px",
        margin: "0 16px",
        boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        backdropFilter: "blur(12px)",
    },
    modalTitle: {
        margin: 0,
        fontSize: "1.1rem",
        fontWeight: "800",
        color: "var(--text-main)",
    },
    modalSub: {
        margin: 0,
        fontSize: "0.84rem",
        color: "var(--text-muted)",
    },
    selectAllRow: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 2px",
    },
    selectAllLabel: {
        display: "flex",
        alignItems: "center",
        fontSize: "0.83rem",
        fontWeight: "600",
        color: "var(--text-main)",
        cursor: "pointer",
    },
    selectedCount: {
        fontSize: "0.78rem",
        color: "#16a34a",
        fontWeight: "700",
    },
    msgLabel: {
        fontSize: "0.82rem",
        fontWeight: "700",
        color: "var(--text-muted)",
        marginTop: "4px",
    },
    operatorList: {
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        maxHeight: "220px",
        overflowY: "auto",
        border: "1px solid var(--border-color)",
        borderRadius: "10px",
        padding: "6px 8px",
        background: "rgba(0,0,0,0.04)",
    },
    operatorItem: {
        display: "flex",
        alignItems: "center",
        cursor: "pointer",
        padding: "8px 10px",
        borderRadius: "8px",
    },
    operatorItemSelected: {
        background: "rgba(22,163,74,0.12)",
    },
    operatorName: {
        fontWeight: "600",
        color: "var(--text-main)",
        fontSize: "0.88rem",
    },
    operatorEmail: {
        color: "var(--text-muted)",
        fontSize: "0.76rem",
        marginTop: "1px",
    },
    msgTextarea: {
        width: "100%",
        border: "1px solid var(--border-color)",
        borderRadius: "8px",
        padding: "10px 12px",
        fontSize: "0.88rem",
        color: "var(--text-main)",
        background: "var(--card-bg)",
        resize: "vertical",
        fontFamily: "Arial, sans-serif",
        boxSizing: "border-box",
    },
    msgActions: {
        display: "flex",
        gap: "8px",
        justifyContent: "flex-end",
    },
    msgCancel: {
        background: "var(--border-color)",
        color: "var(--text-main)",
        border: "none",
        padding: "8px 16px",
        borderRadius: "8px",
        cursor: "pointer",
        fontWeight: "700",
        fontSize: "0.82rem",
    },
    msgSend: {
        background: "#16a34a",
        color: "#fff",
        border: "none",
        padding: "9px 20px",
        borderRadius: "8px",
        cursor: "pointer",
        fontWeight: "700",
        fontSize: "0.85rem",
    },
    msgSendDisabled: {
        background: "#94a3b8",
        cursor: "not-allowed",
    },
    captureArea: {
        background: "#ffffff",
        borderRadius: "10px",
        overflow: "hidden",
        border: "1px solid #e2e8f0",
    },
    tableTitle: {
        fontWeight: "800",
        fontSize: "1rem",
        color: "#0f172a",
        textAlign: "center",
        padding: "12px 16px",
        background: "#ffffff",
        borderBottom: "2px solid #1e3a5f",
        letterSpacing: "0.01em",
    },
    scrollWrapper: {
        overflowX: "auto",
    },
    table: {
        width: "100%",
        borderCollapse: "collapse",
        fontSize: "0.82rem",
        minWidth: "480px",
    },
    thDay: {
        padding: "8px 10px",
        background: "#1e3a5f",
        color: "#ffffff",
        textAlign: "center",
        borderRight: "1px solid #2d4f7c",
        minWidth: "120px",
    },
    dayName: {
        fontWeight: "700",
        fontSize: "0.85rem",
        fontStyle: "italic",
    },
    dayDate: {
        fontWeight: "700",
        fontSize: "0.82rem",
        fontStyle: "italic",
    },
    tdCell: {
        padding: "8px 10px",
        borderBottom: "1px solid #e2e8f0",
        borderRight: "1px solid #e2e8f0",
        verticalAlign: "top",
        minHeight: "52px",
        minWidth: "120px",
        textAlign: "center",
    },
    timeInCell: {
        fontWeight: "700",
        color: "#1e293b",
        fontSize: "0.8rem",
        marginBottom: "4px",
        whiteSpace: "nowrap",
    },
    operatorName: {
        color: "#1e293b",
        fontSize: "0.8rem",
        padding: "1px 0",
    },
    emptySlot: {
        color: "#94a3b8",
        fontSize: "0.78rem",
        padding: "1px 0",
    },
    separator: {
        height: "10px",
        background: "#f1f5f9",
        borderBottom: "1px solid #e2e8f0",
    },
};
