import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { useSocket } from "../hooks/useSocket.js";
import {
    getShifts, getRequests, deleteShift, deleteWeek, updateShift, closeWeek, reviewRequest,
    getUsers, toggleUser, deleteUser, getRegisterCode, updateRegisterCode,
    getAdminRegisterCode, updateAdminRegisterCode, changePassword, assignShift,
    getTransfers, reviewTransfer, removeAssignedOperator, removeManualAssignment, publishWeek, unarchiveWeek,
} from "../api/index.js";

function getMondayOfWeek(isoDate) {
    const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const day = (date.getDay() + 6) % 7; // Lun=0
    date.setDate(date.getDate() - day);
    return date.toISOString().slice(0, 10);
}

function getWeeksFromShifts(shifts) {
    const weeks = new Map();
    for (const s of shifts) {
        if (s.status === "CLOSED") continue;
        const monday = getMondayOfWeek(s.date.slice(0, 10));
        if (!weeks.has(monday)) {
            const d = new Date(monday + "T12:00:00");
            const sunday = new Date(d);
            sunday.setDate(d.getDate() + 6);
            const fmt = (dt) => dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
            weeks.set(monday, { label: `${fmt(d)} – ${fmt(sunday)}`, count: 0 });
        }
        weeks.get(monday).count++;
    }
    return [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b));
}
import PendingRequestCard from "../components/PendingRequestCard.jsx";
import NotificationBell from "../components/NotificationBell.jsx";
import ScheduleTable from "../components/ScheduleTable.jsx";
import ShiftCreatorModal from "../components/ShiftCreatorModal.jsx";
import AdminPublishTutorial, { useAdminTutorial } from "../components/AdminPublishTutorial.jsx";
import { usePushSubscription } from "../hooks/usePushSubscription.js";
import PushPrompt from "../components/PushPrompt.jsx";
import ChatPanel from "../components/ChatPanel.jsx";

const STATUS_LABEL = { OPEN: "Abierto", FULL: "Lleno", CLOSED: "Cerrado" };
const STATUS_STYLE = {
    OPEN: { background: "var(--success-bg)", color: "var(--success)" },
    FULL: { background: "var(--danger-bg)", color: "var(--danger)" },
    CLOSED: { background: "var(--border-color)", color: "var(--text-muted)" },
};

function parseTimeToMinutes(t) {
    const match = t.match(/(\d+):(\d+)(am|pm)/i);
    if (!match) return 0;
    let [, h, m, period] = match;
    h = parseInt(h); m = parseInt(m);
    if (period.toLowerCase() === "pm" && h !== 12) h += 12;
    if (period.toLowerCase() === "am" && h === 12) h = 0;
    return h * 60 + m;
}

function getWeekMonday(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const day = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - day);
    return date.toISOString().slice(0, 10);
}

function weekRangeLabel(mondayStr) {
    const mon = new Date(mondayStr + "T12:00:00");
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const fmt = (d) => d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
    return `Semana ${fmt(mon)} – ${fmt(sun)}`;
}

function ShiftsTable({
    shifts, editingShiftId, editSlots, setEditSlots, setEditingShiftId,
    startEditSlots, handleSaveSlots, handleDeleteShift, onAssign, onViewAssigned,
    userRole, emptyText, styles, muted,
    hideStatus, hidePending, allowAssignClosed, weekSeparators, readOnly, onDeleteWeek, onUnarchiveWeek,
}) {
    const cols = [
        "Fecha", "Horario", "Cupos", "Aprobados",
        ...(!hidePending ? ["Pendientes"] : []),
        ...(!hideStatus ? ["Estado"] : []),
        ...(!readOnly ? ["Acciones"] : []),
    ];
    const colSpan = cols.length;

    const grouped = Object.entries(
        shifts.reduce((acc, shift) => {
            const date = shift.date.slice(0, 10);
            if (!acc[date]) acc[date] = [];
            acc[date].push(shift);
            return acc;
        }, {})
    )
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, group]) => [
            date,
            group.sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime)),
        ]);

    // Build flat row list with optional week separator rows
    const rows = [];
    let lastWeek = null;
    for (const [date, group] of grouped) {
        if (weekSeparators) {
            const wk = getWeekMonday(date);
            if (wk !== lastWeek) {
                rows.push({ type: "week", key: wk, label: weekRangeLabel(wk) });
                lastWeek = wk;
            }
        }
        rows.push({ type: "group", date, group });
    }

    return (
        <div style={styles.tableWrapper}>
            <table style={{ ...styles.table, opacity: muted ? 0.65 : 1 }}>
                <thead>
                    <tr>{cols.map((h) => {
                        const centered = ["Cupos", "Aprobados", "Pendientes", "Estado", "Acciones"].includes(h);
                        return <th key={h} style={{ ...styles.th, ...(centered ? styles.thCenter : {}) }}>{h}</th>;
                    })}</tr>
                </thead>
                <tbody>
                    {grouped.length === 0 && (
                        <tr>
                            <td colSpan={colSpan} style={{ ...styles.td, textAlign: "center", color: "var(--text-muted)" }}>
                                {emptyText}
                            </td>
                        </tr>
                    )}
                    {rows.map((row) => {
                        if (row.type === "week") {
                            return (
                                <tr key={row.key}>
                                    <td colSpan={colSpan} style={{
                                        padding: "6px 12px",
                                        fontSize: "0.72rem",
                                        fontWeight: "700",
                                        color: "var(--text-muted)",
                                        background: "var(--bg-color)",
                                        textTransform: "uppercase",
                                        letterSpacing: "0.06em",
                                        borderTop: "2px solid var(--border-color)",
                                    }}>
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                            <span>{row.label}</span>
                                            <div style={{ display: "flex", gap: "6px" }}>
                                                {onUnarchiveWeek && (() => {
                                                    const mondayDate = new Date(row.key + "T00:00:00");
                                                    const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0);
                                                    if (mondayDate <= todayMidnight) return null;
                                                    return (
                                                        <button
                                                            onClick={() => onUnarchiveWeek(row.key, row.label)}
                                                            style={{
                                                                background: "transparent", color: "var(--primary)",
                                                                border: "1px solid var(--primary)", borderRadius: "6px",
                                                                padding: "2px 8px", cursor: "pointer",
                                                                fontSize: "0.7rem", fontWeight: "700", textTransform: "none",
                                                            }}
                                                        >
                                                            Desarchivar
                                                        </button>
                                                    );
                                                })()}
                                                {onDeleteWeek && (
                                                    <button
                                                        onClick={() => onDeleteWeek(row.key, row.label)}
                                                        style={{
                                                            background: "transparent", color: "var(--danger)",
                                                            border: "1px solid var(--danger)", borderRadius: "6px",
                                                            padding: "2px 8px", cursor: "pointer",
                                                            fontSize: "0.7rem", fontWeight: "700", textTransform: "none",
                                                        }}
                                                    >
                                                        Eliminar semana
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            );
                        }
                        const { group } = row;
                        return group.map((shift, i) => {
                            const approved = (shift.requests?.filter((r) => r.status === "APPROVED").length ?? 0) + (shift.manualAssignments?.length ?? 0);
                            const pending = shift.requests?.filter((r) => r.status === "PENDING").length ?? 0;
                            const canAssign = onAssign && (shift.status !== "CLOSED" || allowAssignClosed);
                            return (
                                <tr key={shift.id} style={styles.tr}>
                                    {i === 0 && (
                                        <td rowSpan={group.length} style={{ ...styles.td, fontWeight: "700", color: "var(--text-main)", verticalAlign: "middle", borderRight: "2px solid var(--border-color)" }}>
                                            {new Date(shift.date.slice(0, 10) + "T00:00:00").toLocaleDateString("es-CO", {
                                                weekday: "short", month: "short", day: "numeric",
                                            })}
                                        </td>
                                    )}
                                    <td style={styles.td}>{shift.startTime} – {shift.endTime}</td>
                                    <td style={{ ...styles.td, ...styles.tdCenter }}>{shift.totalSlots}</td>
                                    <td style={{ ...styles.td, ...styles.tdCenter, color: approved > 0 ? "var(--success)" : "var(--text-muted)", fontWeight: "bold" }}>{approved}</td>
                                    {!hidePending && <td style={{ ...styles.td, ...styles.tdCenter, color: pending > 0 ? "var(--warning)" : "var(--text-muted)" }}>{pending}</td>}
                                    {!hideStatus && (
                                        <td style={{ ...styles.td, ...styles.tdCenter }}>
                                            <span style={{ ...styles.badge, ...STATUS_STYLE[shift.status] }}>
                                                {STATUS_LABEL[shift.status]}
                                            </span>
                                        </td>
                                    )}
                                    {!readOnly && (
                                        <td style={{ ...styles.td, ...styles.tdCenter }}>
                                            {editingShiftId === shift.id ? (
                                                <div style={styles.slotsEditor}>
                                                    <button style={styles.slotBtn} onClick={() => setEditSlots((v) => Math.max(1, v - 1))}>−</button>
                                                    <span style={styles.slotsNum}>{editSlots}</span>
                                                    <button style={styles.slotBtn} onClick={() => setEditSlots((v) => v + 1)}>+</button>
                                                    <button style={styles.saveBtn} onClick={() => handleSaveSlots(shift)}>✓</button>
                                                    <button style={styles.cancelBtn} onClick={() => setEditingShiftId(null)}>✕</button>
                                                </div>
                                            ) : (
                                                <div style={styles.actionBtns}>
                                                    {/* Spacer izquierdo — mismo ancho que Ver para mantener centrado */}
                                                    <div style={{ width: "66px", flexShrink: 0 }} />
                                                    <div style={styles.actionBtnsMain}>
                                                        <button style={styles.editBtn} onClick={() => startEditSlots(shift)}>Cupos</button>
                                                        {canAssign && (
                                                            <button
                                                                style={{ ...styles.assignBtn, ...(approved >= shift.totalSlots ? styles.assignBtnDisabled : {}) }}
                                                                onClick={() => onAssign(shift.id, shift.title)}
                                                                disabled={approved >= shift.totalSlots}
                                                            >
                                                                Asignar
                                                            </button>
                                                        )}
                                                        {["admin", "lead"].includes(userRole) && (
                                                            <button style={styles.deleteBtn} onClick={() => handleDeleteShift(shift.id)}>Eliminar</button>
                                                        )}
                                                    </div>
                                                    <div style={{ width: "66px", flexShrink: 0, display: "flex", justifyContent: "flex-end" }}>
                                                        {onViewAssigned && approved > 0 && (
                                                            <button style={styles.viewAssignedBtn} onClick={() => onViewAssigned(shift)}>
                                                                Ver ({approved})
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            );
                        });
                    })}
                </tbody>
            </table>
        </div>
    );
}

function AdminPage() {
    const navigate = useNavigate();
    const { user, token, logout } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const { show: showTutorial, complete: completeTutorial } = useAdminTutorial();
    usePushSubscription(token);
    const [shifts, setShifts] = useState([]);
    const [shiftsUpdatedAt, setShiftsUpdatedAt] = useState(0);
    const [requests, setRequests] = useState([]);
    const [users, setUsers] = useState([]);
    const [transfers, setTransfers] = useState([]);
    const [activeTab, setActiveTab] = useState("requests");
    const [reqTab, setReqTab] = useState("next"); // "next" | "current"
    const [registerCode, setRegisterCode] = useState("");
    const [newCode, setNewCode] = useState("");
    const [codeVisible, setCodeVisible] = useState(false);
    const [codeLoading, setCodeLoading] = useState(false);
    const [adminRegisterCode, setAdminRegisterCode] = useState("");
    const [newAdminCode, setNewAdminCode] = useState("");
    const [adminCodeVisible, setAdminCodeVisible] = useState(false);
    const [adminCodeLoading, setAdminCodeLoading] = useState(false);
    const [toast, setToast] = useState(null);
    const [notifSignal, setNotifSignal] = useState(0);
    const [showChat, setShowChat] = useState(false);
    const [chatUnread, setChatUnread] = useState(0);
    const [lastChatMessage, setLastChatMessage] = useState(null);
    const [showCreatorModal, setShowCreatorModal] = useState(false);
    const [leaving, setLeaving] = useState(false);
    const [editingShiftId, setEditingShiftId] = useState(null);
    const [editSlots, setEditSlots] = useState(1);
    const [showHistory, setShowHistory] = useState(false);
    const [historyWeekIndex, setHistoryWeekIndex] = useState(0);
    const [scheduleView, setScheduleView] = useState("next"); // "next" | "current"
    const [closingWeek, setClosingWeek] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [showChangePwd, setShowChangePwd] = useState(false);
    const [pwdForm, setPwdForm] = useState({ current: "", next: "", confirm: "" });
    const [pwdError, setPwdError] = useState("");
    const [pwdSuccess, setPwdSuccess] = useState("");
    const [assignModal, setAssignModal] = useState(null); // { shiftId, shiftTitle }
    const [assignForm, setAssignForm] = useState({ name: "", email: "" });
    const [assignLoading, setAssignLoading] = useState(false);
    const [assignedModal, setAssignedModal] = useState(null); // { shift }
    const [confirmModal, setConfirmModal] = useState(null); // { message, onConfirm }

    const loadShifts = useCallback(async () => {
        try { const s = await getShifts(token); setShifts(s); setShiftsUpdatedAt(Date.now()); } catch {}
    }, [token]);

    const loadRequests = useCallback(async () => {
        try { setRequests(await getRequests(token)); } catch {}
    }, [token]);

    const loadUsers = useCallback(async () => {
        try { setUsers(await getUsers(token)); } catch {}
    }, [token]);

    const loadTransfers = useCallback(async () => {
        try { setTransfers(await getTransfers(token)); } catch {}
    }, [token]);

    useEffect(() => {
        loadShifts();
        loadRequests();
        loadUsers();
        loadTransfers();
    }, [loadShifts, loadRequests, loadUsers, loadTransfers]);

    useEffect(() => {
        if (activeTab === "settings" && user?.role === "admin") {
            getRegisterCode(token)
                .then(({ code }) => { setRegisterCode(code ?? ""); setNewCode(code ?? ""); })
                .catch(() => {});
            getAdminRegisterCode(token)
                .then(({ code }) => { setAdminRegisterCode(code ?? ""); setNewAdminCode(code ?? ""); })
                .catch(() => {});
        }
    }, [activeTab, token, user?.role]);

    useSocket(token, {
        "shifts:refresh": () => { loadShifts(); loadRequests(); },
        "requests:refresh": () => loadRequests(),
        "transfers:refresh": () => loadTransfers(),
        "notification:new": () => setNotifSignal((s) => s + 1),
        "chat:message": (msg) => {
            // Solo nos importan mensajes donde somos el destinatario
            if (msg.recipientId !== user?.id) return;
            setLastChatMessage(msg);
            setShowChat((open) => {
                if (!open) setChatUnread((n) => n + 1);
                return open;
            });
        },
        "force:logout": () => {
            logout();
            navigate("/login");
        },
    });

    function showToast(title, message = "") {
        setToast({ title, message });
        setTimeout(() => setToast(null), 4000);
    }

    function handleLogout() {
        setLeaving(true);
        setTimeout(() => { logout(); navigate("/login"); }, 320);
    }

    async function handleApprove(requestId) {
        try {
            await reviewRequest(token, requestId, "approve", "");
            showToast("Solicitud aprobada");
            loadRequests();
            loadShifts();
        } catch (err) { showToast("Error", err.message); }
    }

    async function handleReject(requestId, notes) {
        try {
            await reviewRequest(token, requestId, "reject", notes);
            showToast("Solicitud rechazada");
            loadRequests();
        } catch (err) { showToast("Error", err.message); }
    }

    async function handleCloseWeek(monday, label) {
        setConfirmModal({
            message: `¿Archivar todos los turnos de la semana ${label}? Los turnos quedarán guardados en el historial y las solicitudes pendientes serán canceladas.`,
            confirmLabel: "Archivar",
            onConfirm: async () => {
                setClosingWeek(true);
                try {
                    const result = await closeWeek(token, monday);
                    showToast("Semana archivada", `${result.count} turno(s) archivados correctamente.`);
                    loadShifts();
                    loadRequests();
                } catch (err) { showToast("Error", err.message); }
                finally { setClosingWeek(false); }
            },
        });
    }

    function startEditSlots(shift) {
        setEditingShiftId(shift.id);
        setEditSlots(shift.totalSlots);
    }

    async function handleSaveSlots(shift) {
        const approved = shift.requests?.filter((r) => r.status === "APPROVED").length ?? 0;
        if (editSlots < approved) {
            showToast("Error", `No puedes bajar los cupos por debajo de los ${approved} ya aprobados.`);
            return;
        }
        try {
            await updateShift(token, shift.id, { totalSlots: editSlots });
            setEditingShiftId(null);
            showToast("Cupos actualizados");
            loadShifts();
        } catch (err) { showToast("Error", err.message); }
    }

    async function handleDeleteShift(id) {
        setConfirmModal({
            message: "¿Eliminar este turno? Se cancelarán todas las solicitudes asociadas.",
            onConfirm: async () => {
                try {
                    await deleteShift(token, id);
                    showToast("Turno eliminado");
                    loadShifts();
                } catch (err) { showToast("Error", err.message); }
            },
        });
    }

    async function handlePublishWeek(monday, published) {
        try {
            await publishWeek(token, monday, published);
            showToast(published ? "Turnos publicados" : "Turnos ocultados", published ? "Los operadores ya pueden ver y solicitar estos turnos." : "Los operadores ya no pueden ver estos turnos.");
            loadShifts();
        } catch (err) { showToast("Error", err.message); }
    }

    async function handleUnarchiveWeek(monday, label) {
        setConfirmModal({
            message: `¿Desarchivar la semana ${label}? Los turnos volverán a estar activos.`,
            confirmLabel: "Desarchivar",
            onConfirm: async () => {
                try {
                    const { count } = await unarchiveWeek(token, monday);
                    showToast("Semana desarchivada", `${count} turno(s) restaurados.`);
                    loadShifts();
                } catch (err) { showToast("Error", err.message); }
            },
        });
    }

    async function handleDeleteWeek(monday, label) {
        setConfirmModal({
            message: `¿Eliminar permanentemente todos los turnos de la semana ${label}? Esta acción no se puede deshacer.`,
            onConfirm: async () => {
                try {
                    const { count } = await deleteWeek(token, monday);
                    showToast("Semana eliminada", `${count} turno(s) eliminados.`);
                    loadShifts();
                } catch (err) { showToast("Error", err.message); }
            },
        });
    }

    async function handleToggleUser(id) {
        try {
            const updated = await toggleUser(token, id);
            setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
        } catch (err) { showToast("Error", err.message); }
    }

    async function handleSaveCode(e) {
        e.preventDefault();
        setCodeLoading(true);
        try {
            await updateRegisterCode(token, newCode);
            setRegisterCode(newCode);
            showToast("Código actualizado");
        } catch (err) { showToast("Error", err.message); }
        finally { setCodeLoading(false); }
    }

    async function handleSaveAdminCode(e) {
        e.preventDefault();
        setAdminCodeLoading(true);
        try {
            await updateAdminRegisterCode(token, newAdminCode);
            setAdminRegisterCode(newAdminCode);
            showToast("Código de admins actualizado");
        } catch (err) { showToast("Error", err.message); }
        finally { setAdminCodeLoading(false); }
    }

    async function handleReviewTransfer(transferId, action, isDesistimiento = false) {
        try {
            await reviewTransfer(token, transferId, action, "");
            const label = isDesistimiento ? "Desistimiento" : "Traspaso";
            showToast(action === "approve" ? `${label} aprobado` : `${label} rechazado`);
            loadTransfers();
            loadShifts();
        } catch (err) { showToast("Error", err.message); }
    }

    async function handleRemoveAssigned(shiftId, requestId) {
        setConfirmModal({
            message: "¿Eliminar a este operador del turno?",
            onConfirm: async () => {
                try {
                    await removeAssignedOperator(token, shiftId, requestId);
                    showToast("Operador eliminado del turno");
                    const updatedShifts = await getShifts(token).catch(() => null);
                    if (updatedShifts) {
                        setShifts(updatedShifts);
                        setAssignedModal((prev) => {
                            if (!prev) return null;
                            const updated = updatedShifts.find((s) => s.id === prev.shift.id);
                            return updated ? { shift: updated } : null;
                        });
                    }
                } catch (err) { showToast("Error", err.message); }
            },
        });
    }

    async function handleRemoveManual(shiftId, assignmentId) {
        setConfirmModal({
            message: "¿Eliminar esta asignación del turno?",
            onConfirm: async () => {
                try {
                    await removeManualAssignment(token, shiftId, assignmentId);
                    showToast("Asignación eliminada");
                    const updatedShifts = await getShifts(token).catch(() => null);
                    if (updatedShifts) {
                        setShifts(updatedShifts);
                        setAssignedModal((prev) => {
                            if (!prev) return null;
                            const updated = updatedShifts.find((s) => s.id === prev.shift.id);
                            return updated ? { shift: updated } : null;
                        });
                    }
                } catch (err) { showToast("Error", err.message); }
            },
        });
    }

    async function handleAssign(e) {
        e.preventDefault();
        setAssignLoading(true);
        try {
            await assignShift(token, assignModal.shiftId, assignForm.name, assignForm.email);
            showToast("Operador asignado", `Se notificó a ${assignForm.email}`);
            setAssignModal(null);
            setAssignForm({ name: "", email: "" });
            loadShifts();
        } catch (err) {
            showToast("Error", err.message);
        } finally {
            setAssignLoading(false);
        }
    }

    async function handleChangePwd(e) {
        e.preventDefault();
        setPwdError(""); setPwdSuccess("");
        if (pwdForm.next !== pwdForm.confirm) { setPwdError("Las contraseñas nuevas no coinciden"); return; }
        if (pwdForm.next.length < 6) { setPwdError("Mínimo 6 caracteres"); return; }
        try {
            await changePassword(token, pwdForm.current, pwdForm.next);
            setPwdSuccess("Contraseña actualizada");
            setPwdForm({ current: "", next: "", confirm: "" });
            setTimeout(() => { setShowChangePwd(false); setPwdSuccess(""); }, 2000);
        } catch (err) { setPwdError(err.message); }
    }

    async function handleDeleteUser(id, name, role = "operator") {
        const label = role === "lead" ? "Lead" : "Operador";
        setConfirmModal({
            message: `¿Eliminar permanentemente a ${name}? Se borrarán sus solicitudes y notificaciones. Esta acción no se puede deshacer.`,
            onConfirm: async () => {
                try {
                    await deleteUser(token, id);
                    setUsers((prev) => prev.filter((u) => u.id !== id));
                    showToast(`${label} eliminado`);
                } catch (err) { showToast("Error", err.message); }
            },
        });
    }

    const approvedRequests = shifts.filter((s) => s.status !== "CLOSED").flatMap((s) => (s.requests ?? []).filter((r) => r.status === "APPROVED"));
    const totalApprovedSlots = approvedRequests.length + shifts.filter((s) => s.status !== "CLOSED").reduce((acc, s) => acc + (s.manualAssignments?.length ?? 0), 0);

    // Current week range for request/transfer filtering
    const _now = new Date(); _now.setHours(0, 0, 0, 0);
    const _dow = _now.getDay();
    const _mon = new Date(_now); _mon.setDate(_now.getDate() + (_dow === 0 ? -6 : 1 - _dow));
    const _sun = new Date(_mon); _sun.setDate(_mon.getDate() + 6);
    const isCurrentWeekDate = (dateStr) => { const d = new Date((dateStr || "").slice(0, 10) + "T12:00:00"); return d >= _mon && d <= _sun; };
    // Stats: solo próxima semana (excluye semana actual) — definido aquí porque necesita isCurrentWeekDate
    const nextWeekShifts = shifts.filter((s) => s.status !== "CLOSED" && !isCurrentWeekDate(s.date));
    const nextWeekApproved = nextWeekShifts.flatMap((s) => (s.requests ?? []).filter((r) => r.status === "APPROVED"));
    const totalApprovedSlotsNext = nextWeekApproved.length + nextWeekShifts.reduce((acc, s) => acc + (s.manualAssignments?.length ?? 0), 0);

    const filteredRequests = requests.filter((r) => reqTab === "current" ? isCurrentWeekDate(r.shift?.date) : !isCurrentWeekDate(r.shift?.date));
    const filteredTransfers = transfers.filter((t) => reqTab === "current" ? isCurrentWeekDate(t.shift?.date) : !isCurrentWeekDate(t.shift?.date));
    const hasCurrentWeekItems = requests.some((r) => isCurrentWeekDate(r.shift?.date)) || transfers.some((t) => isCurrentWeekDate(t.shift?.date));

    // Si ya no quedan items de semana actual pero el tab sigue en "current", resetear a "next"
    useEffect(() => {
        if (!hasCurrentWeekItems && reqTab === "current") setReqTab("next");
    }, [hasCurrentWeekItems, reqTab]);

    // Schedule/table view sync
    // "Semana actual" = cualquier turno cuya fecha cae en esta semana (OPEN o CLOSED)
    // "Próxima semana" = turnos no cerrados cuyas fechas NO son de esta semana
    const hasCwShifts = shifts.some((s) => isCurrentWeekDate(s.date));
    const hasCwActiveShifts = shifts.some((s) => isCurrentWeekDate(s.date) && s.status !== "CLOSED");
    const isCwTrulyArchived = hasCwShifts && !hasCwActiveShifts;
    const hasActiveShifts = shifts.some((s) => s.status !== "CLOSED" && !isCurrentWeekDate(s.date));
    const bothSchedulesExist = hasCwShifts && hasActiveShifts;
    const effectiveView = bothSchedulesExist ? scheduleView : (hasCwShifts ? "current" : "next");
    const visibleScheduleShifts = effectiveView === "current"
        ? shifts.filter((s) => isCurrentWeekDate(s.date))
        : shifts.filter((s) => s.status !== "CLOSED" && !isCurrentWeekDate(s.date));

    return (
        <div className={leaving ? "anim-fade-out" : "anim-fade-in"} style={styles.page}>
            {showTutorial && <AdminPublishTutorial onComplete={completeTutorial} />}
            <PushPrompt token={token} />
            {showChat && (
                <ChatPanel
                    token={token}
                    user={user}
                    onClose={() => setShowChat(false)}
                    onUnreadChange={setChatUnread}
                    incomingMessage={lastChatMessage}
                />
            )}

            {toast && (
                <div className="anim-slide-right" style={styles.toast}>
                    <strong>{toast.title}</strong>
                    {toast.message && <p style={styles.toastMsg}>{toast.message}</p>}
                </div>
            )}

            {assignModal && (
                <div className="modal-overlay-anim" style={styles.modalOverlay}>
                    <div className="modal-box-anim" style={styles.modalBox}>
                        <div style={styles.modalHeader}>
                            <h3 style={{ ...styles.modalTitle, margin: 0 }}>Asignar operador</h3>
                            <button style={styles.modalCloseBtn} onClick={() => setAssignModal(null)}>✕</button>
                        </div>
                        <p style={{ margin: "0 0 16px", color: "var(--text-muted)", fontSize: "0.85rem" }}>{assignModal.shiftTitle}</p>
                        <form onSubmit={handleAssign} style={styles.modalForm}>
                            <input
                                style={styles.modalInput}
                                type="text"
                                placeholder="Nombre completo"
                                value={assignForm.name}
                                onChange={(e) => setAssignForm((f) => ({ ...f, name: e.target.value }))}
                                required
                            />
                            <input
                                style={styles.modalInput}
                                type="email"
                                placeholder="Correo electrónico"
                                value={assignForm.email}
                                onChange={(e) => setAssignForm((f) => ({ ...f, email: e.target.value }))}
                                required
                            />
                            <div style={styles.modalActions}>
                                <button type="button" style={styles.modalCancel} onClick={() => setAssignModal(null)}>Cancelar</button>
                                <button type="submit" style={styles.modalSave} disabled={assignLoading}>
                                    {assignLoading ? "Asignando..." : "Asignar y notificar"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {confirmModal && (
                <div className="modal-overlay-anim" style={{ ...styles.modalOverlay, zIndex: 400 }}>
                    <div className="modal-box-anim" style={{ ...styles.modalBox, maxWidth: "460px", textAlign: "center" }}>
                        {(() => {
                            const idx = confirmModal.message.indexOf("?");
                            const hasTwo = idx !== -1 && idx < confirmModal.message.length - 1;
                            const question = hasTwo ? confirmModal.message.slice(0, idx + 1) : confirmModal.message;
                            const detail = hasTwo ? confirmModal.message.slice(idx + 1).trim() : null;
                            return (
                                <>
                                    <p style={{ margin: detail ? "0 0 8px" : "0 0 28px", color: "var(--text-main)", fontSize: "1rem", fontWeight: "700", lineHeight: "1.5" }}>
                                        {question}
                                    </p>
                                    {detail && (
                                        <p style={{ margin: "0 0 28px", color: "var(--text-muted)", fontSize: "0.9rem", fontWeight: "400", lineHeight: "1.55" }}>
                                            {detail}
                                        </p>
                                    )}
                                </>
                            );
                        })()}
                        <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
                            <button style={styles.modalCancel} onClick={() => setConfirmModal(null)}>Cancelar</button>
                            <button
                                style={{ ...styles.modalSave, background: "var(--danger)" }}
                                onClick={() => { setConfirmModal(null); confirmModal.onConfirm(); }}
                            >
                                {confirmModal.confirmLabel ?? "Eliminar"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {assignedModal && (() => {
                const shift = assignedModal.shift;
                const approved = (shift.requests ?? [])
                    .filter((r) => r.status === "APPROVED")
                    .map((r) => ({ id: r.id, name: r.user?.name ?? "—", email: r.user?.email ?? "", type: "request" }));
                const manual = (shift.manualAssignments ?? [])
                    .map((a) => ({ id: a.id, name: a.name, email: a.email, type: "manual" }));
                const all = [...approved, ...manual].sort((a, b) => a.name.localeCompare(b.name, "es"));
                return (
                    <div className="modal-overlay-anim" style={styles.modalOverlay}>
                        <div className="modal-box-anim" style={{ ...styles.modalBox, maxWidth: "460px" }}>
                            <div style={styles.modalHeader}>
                                <h3 style={{ ...styles.modalTitle, margin: 0 }}>Operadores asignados</h3>
                                <button style={styles.modalCloseBtn} onClick={() => setAssignedModal(null)}>✕</button>
                            </div>
                            <p style={{ margin: "0 0 4px", color: "var(--text-muted)", fontSize: "0.85rem" }}>{shift.title}</p>
                            <p style={{ margin: "0 0 16px", color: "var(--text-muted)", fontSize: "0.82rem" }}>
                                {new Date(shift.date.slice(0, 10) + "T00:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}
                                {" · "}{shift.startTime} – {shift.endTime}
                            </p>
                            {all.length === 0 ? (
                                <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "20px 0", fontSize: "0.9rem" }}>
                                    No hay operadores asignados aún.
                                </p>
                            ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "340px", overflowY: "auto" }}>
                                    {all.map((op) => (
                                        <div key={op.id} style={styles.assignedRow}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <p style={{ margin: 0, fontWeight: "700", color: "var(--text-main)", fontSize: "0.9rem" }}>{op.name}</p>
                                                <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.78rem" }}>
                                                    {op.email}
                                                    <span style={{ marginLeft: "8px", ...styles.typeBadge, ...(op.type === "manual" ? styles.typeBadgeManual : styles.typeBadgeRequest) }}>
                                                        {op.type === "manual" ? "Manual" : "Solicitud"}
                                                    </span>
                                                </p>
                                            </div>
                                            <button
                                                style={styles.removeBtn}
                                                onClick={() => op.type === "manual"
                                                    ? handleRemoveManual(shift.id, op.id)
                                                    : handleRemoveAssigned(shift.id, op.id)
                                                }
                                            >
                                                Eliminar
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "20px" }}>
                                <button style={styles.modalCancel} onClick={() => setAssignedModal(null)}>Cerrar</button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {showChangePwd && (
                <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={() => setShowChangePwd(false)}>
                    <div className="modal-box-anim" style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
                        <h3 style={styles.modalTitle}>Cambiar contraseña</h3>
                        <form onSubmit={handleChangePwd} style={styles.modalForm}>
                            <input style={styles.modalInput} type="password" placeholder="Contraseña actual"
                                value={pwdForm.current} onChange={(e) => setPwdForm((f) => ({ ...f, current: e.target.value }))} required />
                            <input style={styles.modalInput} type="password" placeholder="Nueva contraseña"
                                value={pwdForm.next} onChange={(e) => setPwdForm((f) => ({ ...f, next: e.target.value }))} required />
                            <input style={styles.modalInput} type="password" placeholder="Confirmar nueva contraseña"
                                value={pwdForm.confirm} onChange={(e) => setPwdForm((f) => ({ ...f, confirm: e.target.value }))} required />
                            {pwdError && <p style={styles.modalError}>{pwdError}</p>}
                            {pwdSuccess && <p style={styles.modalSuccess}>{pwdSuccess}</p>}
                            <div style={styles.modalActions}>
                                <button type="button" style={styles.modalCancel} onClick={() => setShowChangePwd(false)}>Cancelar</button>
                                <button type="submit" style={styles.modalSave}>Guardar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div style={styles.container}>
                <header style={styles.header}>
                    <div>
                        <h1 style={styles.title}>Panel {user?.role === "admin" ? "Admin" : "Lead"}</h1>
                        <p style={styles.subtitle}>{user?.name} · SLC Turnos</p>
                    </div>
                    <div style={styles.headerActions}>
                        <button
                            className="icon-btn"
                            style={{ ...styles.menuButton, position: "relative" }}
                            onClick={() => { setShowChat(true); setChatUnread(0); }}
                            title="Mensajes"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                            </svg>
                            {chatUnread > 0 && (
                                <span style={{ position: "absolute", top: "-3px", right: "-3px", width: "9px", height: "9px", background: "#ef4444", borderRadius: "50%", border: "2px solid var(--bg-color)" }} />
                            )}
                        </button>
                        <NotificationBell token={token} refreshSignal={notifSignal} />
                        <div style={{ position: "relative" }}>
                            <button
                                style={{ ...styles.menuButton, ...(showMenu ? styles.menuButtonActive : {}) }}
                                className="icon-btn"
                                onClick={() => setShowMenu((v) => !v)}
                                title="Menú"
                            >
                                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                                    <rect y="2" width="18" height="2" rx="1" fill="currentColor"/>
                                    <rect y="8" width="18" height="2" rx="1" fill="currentColor"/>
                                    <rect y="14" width="18" height="2" rx="1" fill="currentColor"/>
                                </svg>
                            </button>
                            {showMenu && (
                                <>
                                    <div style={styles.menuBackdrop} onClick={() => setShowMenu(false)} />
                                    <div className="dropdown-anim" style={styles.menuDropdown}>
                                        <button style={styles.menuItem} onClick={() => { setShowMenu(false); toggleTheme(); }}>
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                {theme === "dark"
                                                    ? <><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></>
                                                    : <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                                                }
                                            </svg>
                                            {theme === "dark" ? "Modo claro" : "Modo oscuro"}
                                        </button>
                                        <button style={styles.menuItem} onClick={() => { setShowMenu(false); setShowChangePwd(true); setPwdError(""); setPwdSuccess(""); }}>
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                                            </svg>
                                            Cambiar contraseña
                                        </button>
                                        <div style={styles.menuDivider} />
                                        <button style={{ ...styles.menuItem, color: "var(--danger)" }} onClick={() => { setShowMenu(false); handleLogout(); }}>
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                                            </svg>
                                            Cerrar sesión
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </header>

                {/* Barra de estadísticas */}
                <div className="admin-stats-bar" style={styles.statsBar}>
                    {[
                        { value: nextWeekShifts.filter((s) => s.status === "OPEN").length, label: "Turnos abiertos" },
                        { value: requests.length, label: "Solicitudes pendientes" },
                        { value: totalApprovedSlotsNext, label: "Cupos aprobados" },
                        { value: users.filter((u) => u.role === "operator" && u.active).length, label: "Operadores activos" },
                    ].map(({ value, label }, i) => (
                        <div key={label} style={{ ...styles.statItem, ...(i > 0 ? styles.statItemBorder : {}) }}>
                            <span className="stat-num" style={styles.statNum}>{value}</span>
                            <span className="stat-label" style={styles.statLabel}>{label}</span>
                        </div>
                    ))}
                </div>

                {/* Pestañas de navegación */}
                <div style={styles.tabs}>
                    {[
                        { id: "requests", label: `Solicitudes${requests.length + transfers.length > 0 ? ` (${requests.length + transfers.length})` : ""}` },
                        { id: "shifts", label: "Turnos" },
                        { id: "users", label: "Operadores" },
                        ...(user?.role === "admin" ? [{ id: "leads", label: "Leads" }] : []),
                        ...(user?.role === "admin" ? [{ id: "settings", label: "⚙ Ajustes" }] : []),
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            style={{ ...styles.tab, ...(activeTab === tab.id ? styles.tabActive : {}) }}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {activeTab === "requests" && (
                    <section style={styles.section}>
                        {/* Tab toggle semana actual / próxima — solo si hay items de la semana actual */}
                        {hasCurrentWeekItems && (
                            <div style={{ display: "flex", gap: "8px", marginBottom: "20px", overflowX: "auto", scrollbarWidth: "none" }}>
                                <button style={{ ...styles.tab, flexShrink: 0, ...(reqTab === "next" ? styles.tabActive : {}) }} onClick={() => setReqTab("next")}>
                                    Próxima semana{requests.filter((r) => !isCurrentWeekDate(r.shift?.date)).length + transfers.filter((t) => !isCurrentWeekDate(t.shift?.date)).length > 0 ? ` (${requests.filter((r) => !isCurrentWeekDate(r.shift?.date)).length + transfers.filter((t) => !isCurrentWeekDate(t.shift?.date)).length})` : ""}
                                </button>
                                <button style={{ ...styles.tab, flexShrink: 0, ...(reqTab === "current" ? styles.tabActive : {}) }} onClick={() => setReqTab("current")}>
                                    Semana actual{requests.filter((r) => isCurrentWeekDate(r.shift?.date)).length + transfers.filter((t) => isCurrentWeekDate(t.shift?.date)).length > 0 ? ` (${requests.filter((r) => isCurrentWeekDate(r.shift?.date)).length + transfers.filter((t) => isCurrentWeekDate(t.shift?.date)).length})` : ""}
                                </button>
                            </div>
                        )}

                        {/* Traspasos y desistimientos filtrados */}
                        {filteredTransfers.length > 0 && (() => {
                            const traspasos = filteredTransfers.filter((t) => !!t.toName);
                            const desistimientos = filteredTransfers.filter((t) => !t.toName);
                            return (
                            <div style={{ marginBottom: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
                                {desistimientos.length > 0 && (
                                    <div>
                                        <p style={{ ...styles.requestListHint, marginBottom: "10px", color: "var(--danger)", fontWeight: "700" }}>
                                            Desistimientos pendientes · {desistimientos.length}
                                        </p>
                                        {desistimientos.map((t) => (
                                            <div key={t.id} style={{ ...styles.transferCard, borderLeft: "4px solid var(--danger)" }}>
                                                <div style={{ flex: 1 }}>
                                                    <p style={styles.transferTitle}>{t.shift?.title}</p>
                                                    <p style={styles.transferMeta}>
                                                        {new Date(t.shift?.date).toLocaleDateString("es-CO", { weekday: "short", month: "short", day: "numeric" })}
                                                        {" · "}{t.shift?.startTime} – {t.shift?.endTime}
                                                    </p>
                                                    <p style={styles.transferMeta}>
                                                        <strong>{t.fromUser?.name}</strong> quiere desistir de este turno
                                                    </p>
                                                </div>
                                                <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                                                    <button style={styles.approveBtn} onClick={() => handleReviewTransfer(t.id, "approve", true)}>Aprobar</button>
                                                    <button style={styles.rejectTransferBtn} onClick={() => handleReviewTransfer(t.id, "reject", true)}>Rechazar</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {traspasos.length > 0 && (
                                    <div>
                                        <p style={{ ...styles.requestListHint, marginBottom: "10px", color: "var(--primary)", fontWeight: "700" }}>
                                            Traspasos pendientes · {traspasos.length}
                                        </p>
                                        {traspasos.map((t) => (
                                            <div key={t.id} style={{ ...styles.transferCard, borderLeft: "4px solid var(--primary)" }}>
                                                <div style={{ flex: 1 }}>
                                                    <p style={styles.transferTitle}>{t.shift?.title}</p>
                                                    <p style={styles.transferMeta}>
                                                        {new Date(t.shift?.date).toLocaleDateString("es-CO", { weekday: "short", month: "short", day: "numeric" })}
                                                        {" · "}{t.shift?.startTime} – {t.shift?.endTime}
                                                    </p>
                                                    <p style={styles.transferMeta}>
                                                        <strong>{t.fromUser?.name}</strong> quiere pasar su turno a <strong>{t.toName}</strong> ({t.toEmail})
                                                    </p>
                                                </div>
                                                <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                                                    <button style={styles.approveBtn} onClick={() => handleReviewTransfer(t.id, "approve")}>Aprobar</button>
                                                    <button style={styles.rejectTransferBtn} onClick={() => handleReviewTransfer(t.id, "reject")}>Rechazar</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            );
                        })()}

                        {/* Solicitudes filtradas */}
                        {filteredRequests.length === 0 && filteredTransfers.length === 0 ? (
                            <p style={styles.empty}>No hay solicitudes pendientes{hasCurrentWeekItems ? ` para la ${reqTab === "current" ? "semana actual" : "próxima semana"}` : ""}.</p>
                        ) : filteredRequests.length > 0 && (
                            <div style={styles.requestList}>
                                <div style={styles.requestListHeader}>
                                    <span style={styles.requestListHint}>
                                        Ordenadas de más antigua a más reciente · {filteredRequests.length} pendiente{filteredRequests.length !== 1 ? "s" : ""}
                                    </span>
                                </div>
                                {filteredRequests.map((req, idx) => (
                                    <PendingRequestCard
                                        key={req.id}
                                        request={req}
                                        index={idx}
                                        onApprove={handleApprove}
                                        onReject={handleReject}
                                    />
                                ))}
                            </div>
                        )}
                    </section>
                )}

                {activeTab === "shifts" && (
                    <section style={styles.section}>
                        <div style={styles.sectionHeader}>
                            <h2 style={styles.sectionTitle}>Turnos creados</h2>
                            <button style={styles.createButton} onClick={() => setShowCreatorModal(true)}>
                                + Nuevo turno
                            </button>
                        </div>

                        {/* Aviso: semana actual archivada, sin próxima semana creada */}
                        {isCwTrulyArchived && !hasActiveShifts && (
                            <div style={styles.nextWeekNotice}>
                                <span style={{ fontSize: "1.1rem" }}>📅</span>
                                <div>
                                    <strong>La semana actual ya está archivada.</strong>
                                    <p style={{ margin: "2px 0 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                                        Crea los turnos de la próxima semana para que los operadores puedan solicitar cupos.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Navegación entre semanas + horario visual */}
                        {(hasCwShifts || hasActiveShifts) && (
                            <div style={{ marginBottom: "8px" }}>
                                {bothSchedulesExist && (
                                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                                        <button
                                            style={{ ...styles.scheduleNavBtn, ...(effectiveView === "next" ? { opacity: 0.3, cursor: "not-allowed" } : {}) }}
                                            onClick={() => setScheduleView("next")}
                                            disabled={effectiveView === "next"}
                                            title="Próxima semana"
                                        >
                                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                            </svg>
                                        </button>
                                        <span style={styles.historySectionLabel}>
                                            {effectiveView === "current" ? "Semana actual — en curso" : "Próxima semana — turnos abiertos"}
                                        </span>
                                        <button
                                            style={{ ...styles.scheduleNavBtn, ...(effectiveView === "current" ? { opacity: 0.3, cursor: "not-allowed" } : {}) }}
                                            onClick={() => setScheduleView("current")}
                                            disabled={effectiveView === "current"}
                                            title="Semana actual"
                                        >
                                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                            </svg>
                                        </button>
                                    </div>
                                )}
                                <ScheduleTable
                                    shifts={visibleScheduleShifts}
                                    updatedAt={shiftsUpdatedAt}
                                    canExport
                                    token={token}
                                    showAll={effectiveView === "current"}
                                    publishToggle={effectiveView !== "current" ? (() => {
                                        const weeks = getWeeksFromShifts(visibleScheduleShifts);
                                        if (!weeks.length) return null;
                                        const [monday] = weeks[0];
                                        const isPublished = visibleScheduleShifts.some((s) => s.status !== "CLOSED" && s.published);
                                        return { monday, isPublished, onToggle: () => handlePublishWeek(monday, !isPublished) };
                                    })() : null}
                                />
                            </div>
                        )}

                        {/* Archivar semana — solo muestra la semana visible en el schedule */}
                        {(() => {
                            const allWeeks = getWeeksFromShifts(shifts);
                            if (!allWeeks.length) return null;
                            // Obtener el lunes de la semana actualmente visible
                            const visibleMonday = visibleScheduleShifts.length
                                ? getMondayOfWeek(visibleScheduleShifts[0].date.slice(0, 10))
                                : null;
                            const week = visibleMonday ? allWeeks.find(([m]) => m === visibleMonday) : null;
                            if (!week) return null;
                            const [monday, { label, count }] = week;
                            const isCurrent = monday === _mon.toISOString().slice(0, 10);
                            const isOldest = allWeeks[0][0] === monday;
                            return (
                                <div style={styles.weekActions}>
                                    <span style={styles.weekActionsLabel}>
                                        📁 {label} <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: "0.82rem" }}>({count} turnos)</span>
                                    </span>
                                    {isOldest && (
                                        <div style={styles.weekBtns}>
                                            <button
                                                style={{ ...styles.closeWeekBtn, ...(isCurrent ? { background: "var(--warning)", color: "#000", border: "none" } : {}), ...(closingWeek ? styles.exportBtnDisabled : {}) }}
                                                disabled={closingWeek}
                                                onClick={() => handleCloseWeek(monday, label)}
                                            >
                                                Archivar semana
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Tabla sincronizada con el horario visible */}
                        <ShiftsTable
                            shifts={visibleScheduleShifts}
                            editingShiftId={editingShiftId}
                            editSlots={editSlots}
                            setEditSlots={setEditSlots}
                            setEditingShiftId={setEditingShiftId}
                            startEditSlots={startEditSlots}
                            handleSaveSlots={handleSaveSlots}
                            handleDeleteShift={handleDeleteShift}
                            onAssign={(shiftId, shiftTitle) => { setAssignModal({ shiftId, shiftTitle }); setAssignForm({ name: "", email: "" }); }}
                            onViewAssigned={(shift) => setAssignedModal({ shift })}
                            userRole={user?.role}
                            emptyText="No hay turnos"
                            styles={styles}
                            allowAssignClosed={effectiveView === "current"}
                        />

                        {/* Historial de turnos */}
                        {(() => {
                            const closedShifts = shifts.filter((s) => s.status === "CLOSED" && !isCurrentWeekDate(s.date));
                            // Agrupar por semana
                            const weekMap = new Map();
                            for (const s of closedShifts) {
                                const mon = getMondayOfWeek(s.date.slice(0, 10));
                                if (!weekMap.has(mon)) weekMap.set(mon, []);
                                weekMap.get(mon).push(s);
                            }
                            const historyWeeks = [...weekMap.entries()].sort(([a], [b]) => b.localeCompare(a)); // más reciente primero
                            const totalWeeks = historyWeeks.length;
                            const safeIdx = Math.min(historyWeekIndex, Math.max(0, totalWeeks - 1));
                            const currentHistoryWeek = historyWeeks[safeIdx];

                            return (
                                <div style={{ marginTop: "24px", borderTop: "1px solid var(--card-border)", paddingTop: "24px" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                                        <div>
                                            <h3 style={styles.settingsLabel}>Historial de turnos</h3>
                                            <p style={styles.settingsHint}>Semanas cerradas — solo lectura.</p>
                                        </div>
                                        <button
                                            style={{ ...styles.historyToggle, ...(showHistory ? styles.historyToggleActive : {}) }}
                                            onClick={() => { setShowHistory((v) => !v); setHistoryWeekIndex(0); }}
                                        >
                                            {showHistory ? "Ocultar" : "Ver historial"}
                                        </button>
                                    </div>

                                    {showHistory && (
                                        totalWeeks === 0 ? (
                                            <p style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>No hay semanas cerradas aún.</p>
                                        ) : (
                                            <div>
                                                {/* Navegación */}
                                                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                                                    <button
                                                        style={{ ...styles.scheduleNavBtn, ...(safeIdx === 0 ? { opacity: 0.3, cursor: "not-allowed" } : {}) }}
                                                        onClick={() => setHistoryWeekIndex((i) => Math.max(0, i - 1))}
                                                        disabled={safeIdx === 0}
                                                        title="Semana más reciente"
                                                    >
                                                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                                    </button>
                                                    <span style={{ ...styles.historySectionLabel, paddingBottom: 0 }}>
                                                        {weekRangeLabel(currentHistoryWeek[0])}
                                                        <span style={{ marginLeft: "8px", fontWeight: 400, fontSize: "0.78rem" }}>({safeIdx + 1} de {totalWeeks})</span>
                                                    </span>
                                                    <button
                                                        style={{ ...styles.scheduleNavBtn, ...(safeIdx === totalWeeks - 1 ? { opacity: 0.3, cursor: "not-allowed" } : {}) }}
                                                        onClick={() => setHistoryWeekIndex((i) => Math.min(totalWeeks - 1, i + 1))}
                                                        disabled={safeIdx === totalWeeks - 1}
                                                        title="Semana más antigua"
                                                    >
                                                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                                    </button>

                                                    {/* Botones de acción para la semana visible */}
                                                    <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
                                                        {(() => {
                                                            const mondayDate = new Date(currentHistoryWeek[0] + "T00:00:00");
                                                            const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0);
                                                            const label = weekRangeLabel(currentHistoryWeek[0]);
                                                            return mondayDate > todayMidnight ? (
                                                                <button
                                                                    onClick={() => handleUnarchiveWeek(currentHistoryWeek[0], label)}
                                                                    style={{ ...styles.historyToggle, color: "var(--primary)", borderColor: "var(--primary)" }}
                                                                >
                                                                    Desarchivar
                                                                </button>
                                                            ) : null;
                                                        })()}
                                                        <button
                                                            onClick={() => handleDeleteWeek(currentHistoryWeek[0], weekRangeLabel(currentHistoryWeek[0]))}
                                                            style={{ ...styles.historyToggle, color: "var(--danger)", borderColor: "var(--danger)" }}
                                                        >
                                                            Eliminar semana
                                                        </button>
                                                    </div>
                                                </div>

                                                <ShiftsTable
                                                    shifts={currentHistoryWeek[1]}
                                                    emptyText="No hay turnos."
                                                    styles={styles}
                                                    hideStatus
                                                    hidePending
                                                    readOnly
                                                />
                                            </div>
                                        )
                                    )}
                                </div>
                            );
                        })()}

                    </section>
                )}

                {activeTab === "users" && (
                    <section style={styles.section}>
                        <h2 style={styles.sectionTitle}>Operadores del equipo</h2>

                        <div style={styles.tableWrapper}>
                            <table style={styles.table}>
                                <thead>
                                    <tr>
                                        {["Nombre", "Correo", "Grupo", "Estado", "Acciones"].map((h) => (
                                            <th key={h} style={styles.th}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.filter((u) => u.role === "operator").map((u) => (
                                        <tr key={u.id} style={styles.tr}>
                                            <td style={styles.td}>{u.name}</td>
                                            <td style={styles.td}>{u.email}</td>
                                            <td style={styles.td}>{u.group ?? <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                                            <td style={styles.td}>
                                                <span style={{
                                                    ...styles.badge,
                                                    ...(u.active
                                                        ? { background: "var(--success-bg)", color: "var(--success)" }
                                                        : { background: "var(--danger-bg)", color: "var(--danger)" }),
                                                }}>
                                                    {u.active ? "Activo" : "Baneado"}
                                                </span>
                                            </td>
                                            <td style={styles.td}>
                                                <div style={styles.actionBtns}>
                                                    <button
                                                        style={u.active ? styles.warnBtn : styles.activateBtn}
                                                        onClick={() => handleToggleUser(u.id)}
                                                    >
                                                        {u.active ? "Banear" : "Desbanear"}
                                                    </button>
                                                    <button
                                                        style={styles.deleteBtn}
                                                        onClick={() => handleDeleteUser(u.id, u.name)}
                                                    >
                                                        Eliminar
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {users.filter((u) => u.role === "operator").length === 0 && (
                                        <tr>
                                            <td colSpan={5} style={{ ...styles.td, textAlign: "center", color: "var(--text-muted)" }}>
                                                No hay operadores registrados
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}

                {activeTab === "leads" && user?.role === "admin" && (
                    <section style={styles.section}>
                        <h2 style={styles.sectionTitle}>Leads del equipo</h2>
                        <div style={styles.tableWrapper}>
                            <table style={styles.table}>
                                <thead>
                                    <tr>
                                        {["Nombre", "Correo", "Acciones"].map((h) => (
                                            <th key={h} style={styles.th}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.filter((u) => u.role === "lead").map((u) => (
                                        <tr key={u.id} style={styles.tr}>
                                            <td style={styles.td}>{u.name}</td>
                                            <td style={styles.td}>{u.email}</td>
                                            <td style={styles.td}>
                                                <button
                                                    style={styles.deleteBtn}
                                                    onClick={() => handleDeleteUser(u.id, u.name, "lead")}
                                                >
                                                    Eliminar
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {users.filter((u) => u.role === "lead").length === 0 && (
                                        <tr>
                                            <td colSpan={3} style={{ ...styles.td, textAlign: "center", color: "var(--text-muted)" }}>
                                                No hay leads registrados
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}

                {activeTab === "settings" && user?.role === "admin" && (
                    <section style={styles.section}>
                        <h2 style={styles.sectionTitle}>Ajustes del sistema</h2>

                        <div style={styles.settingsBlock}>
                            <h3 style={styles.settingsLabel}>Código de acceso — operadores</h3>
                            <p style={styles.settingsHint}>
                                Los operadores usan este código al registrarse. Cámbialo para revocar el acceso a nuevos registros.
                            </p>
                            <form style={styles.settingsForm} onSubmit={handleSaveCode}>
                                <div style={styles.codeRow}>
                                    <input
                                        type={codeVisible ? "text" : "password"}
                                        style={styles.codeInput}
                                        value={newCode}
                                        onChange={(e) => setNewCode(e.target.value)}
                                        required
                                        minLength={4}
                                        placeholder="Nuevo código"
                                    />
                                    <button
                                        type="button"
                                        style={styles.codeToggleBtn}
                                        onClick={() => setCodeVisible((v) => !v)}
                                    >
                                        {codeVisible ? "Ocultar" : "Ver"}
                                    </button>
                                </div>
                                <p style={styles.codeCurrentHint}>
                                    Código actual: <strong>{codeVisible ? registerCode : "••••••••"}</strong>
                                </p>
                                <button
                                    type="submit"
                                    style={styles.createButton}
                                    disabled={codeLoading || newCode === registerCode || newCode.length < 4}
                                >
                                    {codeLoading ? "Guardando..." : "Guardar nuevo código"}
                                </button>
                            </form>
                        </div>

                        <div style={{ marginTop: "24px", borderTop: "1px solid var(--card-border)", paddingTop: "24px" }}>
                            <h3 style={styles.settingsLabel}>Código de acceso — leads</h3>

                            <p style={styles.settingsHint}>
                                Los leads usan este código al registrarse. No es necesario seleccionar grupo con este código.
                            </p>
                            <form style={styles.settingsForm} onSubmit={handleSaveAdminCode}>
                                <div style={styles.codeRow}>
                                    <input
                                        type={adminCodeVisible ? "text" : "password"}
                                        style={styles.codeInput}
                                        value={newAdminCode}
                                        onChange={(e) => setNewAdminCode(e.target.value)}
                                        required
                                        minLength={4}
                                        placeholder="Nuevo código admin"
                                    />
                                    <button
                                        type="button"
                                        style={styles.codeToggleBtn}
                                        onClick={() => setAdminCodeVisible((v) => !v)}
                                    >
                                        {adminCodeVisible ? "Ocultar" : "Ver"}
                                    </button>
                                </div>
                                <p style={styles.codeCurrentHint}>
                                    Código actual: <strong>{adminCodeVisible ? adminRegisterCode : "••••••••"}</strong>
                                </p>
                                <button
                                    type="submit"
                                    style={styles.createButton}
                                    disabled={adminCodeLoading || newAdminCode === adminRegisterCode || newAdminCode.length < 4}
                                >
                                    {adminCodeLoading ? "Guardando..." : "Guardar nuevo código"}
                                </button>
                            </form>
                        </div>

                    </section>
                )}
            </div>

            {showCreatorModal && (
                <ShiftCreatorModal
                    token={token}
                    onClose={() => setShowCreatorModal(false)}
                    onCreated={(msg) => { showToast(msg); loadShifts(); setScheduleView("next"); }}
                />
            )}
        </div>
    );
}

const styles = {
    page: {
        minHeight: "100vh",
        background: "transparent",
        fontFamily: "var(--font-family)",
        padding: "16px",
    },
    container: { maxWidth: "1300px", margin: "0 auto" },
    header: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "12px",
        marginBottom: "16px",
        flexWrap: "wrap",
    },
    title: { margin: 0, color: "var(--text-main)", fontSize: "1.8rem", fontWeight: "800" },
    subtitle: { margin: "6px 0 0", color: "var(--text-muted)", fontSize: "0.9rem" },
    headerActions: { display: "flex", gap: "10px", alignItems: "center" },
    menuButton: {
        background: "var(--card-bg)", color: "var(--text-main)", border: "none",
        boxShadow: "0 0 0 1px var(--card-border)",
        width: "40px", height: "40px", borderRadius: "10px", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background 0.15s ease, box-shadow 0.15s ease, color 0.15s ease",
    },
    menuButtonActive: {
        background: "#3b82f6", boxShadow: "0 0 0 1px #3b82f6", color: "#fff",
    },
    menuBackdrop: { position: "fixed", inset: 0, zIndex: 99 },
    menuDropdown: {
        position: "absolute", top: "calc(100% + 8px)", right: 0,
        background: "var(--card-bg)", border: "1px solid var(--card-border)",
        borderRadius: "12px", boxShadow: "var(--card-shadow)",
        padding: "6px", minWidth: "200px", zIndex: 100, backdropFilter: "blur(16px)",
    },
    menuItem: {
        display: "flex", alignItems: "center", gap: "10px", width: "100%",
        background: "none", border: "none", borderRadius: "8px", padding: "10px 12px",
        color: "var(--text-main)", fontSize: "0.88rem", fontWeight: "600",
        cursor: "pointer", textAlign: "left", transition: "background 0.15s ease",
    },
    menuDivider: { height: "1px", background: "var(--border-color)", margin: "4px 0" },
    statsBar: {
        display: "flex",
        background: "var(--card-bg)",
        border: "1px solid var(--card-border)",
        borderRadius: "14px",
        boxShadow: "var(--card-shadow)",
        backdropFilter: "blur(16px)",
        marginBottom: "16px",
        overflow: "hidden",
    },
    statItem: {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "4px",
        padding: "18px 12px",
    },
    statItemBorder: {
        borderLeft: "1px solid var(--border-color)",
    },
    statNum: { fontSize: "1.8rem", fontWeight: "800", color: "var(--text-main)", lineHeight: 1 },
    statLabel: { fontSize: "0.75rem", fontWeight: "700", color: "var(--primary)", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "center" },
    tabs: { display: "flex", gap: "6px", marginBottom: "20px", overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none", msOverflowStyle: "none" },
    tab: {
        padding: "10px 18px", borderRadius: "10px", border: "1.5px solid transparent",
        background: "var(--card-bg)", color: "var(--text-muted)", cursor: "pointer", fontWeight: "600", fontSize: "0.9rem",
        transition: "all 0.18s ease", flexShrink: 0,
    },
    tabActive: {
        background: "var(--primary)", border: "1.5px solid var(--primary)", color: "#ffffff",
    },
    section: {
        background: "var(--card-bg)", border: "1px solid var(--border-color)",
        borderRadius: "18px", padding: "24px", boxShadow: "var(--card-shadow)", backdropFilter: "blur(16px)"
    },
    sectionHeader: {
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: "20px", flexWrap: "wrap", gap: "12px",
    },
    sectionTitle: { margin: 0, color: "var(--text-main)", fontSize: "1.15rem" },
    requestList: { display: "flex", flexDirection: "column", gap: "8px", },
    requestListHeader: { marginBottom: "4px", },
    requestListHint: { color: "var(--text-muted)", fontSize: "0.78rem", },
    createButton: {
        background: "var(--primary)", color: "#fff", border: "none",
        padding: "10px 16px", borderRadius: "10px", cursor: "pointer", fontWeight: "bold", fontSize: "0.9rem",
        transition: "transform 0.15s ease, filter 0.15s ease",
    },
    form: {
        background: "var(--card-bg)", border: "1px solid var(--border-color)",
        borderRadius: "14px", padding: "20px", marginBottom: "20px",
    },
    formTitle: { margin: "0 0 16px", color: "var(--text-main)", fontSize: "1rem" },
    formGrid: {
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        gap: "12px", marginBottom: "16px",
    },
    formField: { display: "flex", flexDirection: "column", gap: "4px" },
    formLabel: { fontSize: "0.82rem", fontWeight: "600", color: "var(--text-muted)" },
    formInput: {
        padding: "9px 12px", border: "1.5px solid var(--border-color)", borderRadius: "8px",
        fontSize: "0.9rem", outline: "none", background: "var(--input-bg)", color: "var(--text-main)",
    },
    formActions: { display: "flex", gap: "8px" },
    cancelBtn: {
        background: "var(--card-bg)", color: "var(--text-muted)", border: "1px solid var(--border-color)",
        padding: "4px 8px", borderRadius: "6px", cursor: "pointer", fontWeight: "700", fontSize: "0.85rem",
    },
    tableWrapper: { overflowX: "auto", marginTop: "4px" },
    table: { width: "100%", borderCollapse: "collapse" },
    th: {
        textAlign: "left", padding: "8px 12px", borderBottom: "1px solid var(--border-color)",
        color: "var(--text-muted)", background: "var(--hover-overlay)", fontSize: "0.78rem",
        fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.04em",
    },
    thCenter: {
        textAlign: "center",
    },
    tr: { borderBottom: "1px solid var(--card-border)" },
    td: { padding: "10px 12px", color: "var(--text-main)", fontSize: "0.88rem" },
    tdCenter: { textAlign: "center" },
    badge: {
        padding: "4px 10px", borderRadius: "999px", fontSize: "0.8rem", fontWeight: "bold", whiteSpace: "nowrap",
    },
    weekActions: {
        background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "12px",
        padding: "12px 16px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap",
    },
    weekActionsLabel: {
        fontWeight: "700", color: "var(--warning)", fontSize: "0.85rem", whiteSpace: "nowrap",
    },
    weekBtns: { display: "flex", gap: "8px", flexWrap: "wrap", },
    closeWeekBtn: {
        background: "var(--primary)", color: "#fff", border: "none",
        padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontWeight: "700", fontSize: "0.82rem",
    },
    exportBtnDisabled: { background: "var(--border-color)", cursor: "not-allowed", },
    historyToggleRow: { display: "flex", justifyContent: "flex-end", marginBottom: "12px", },
    historyToggle: {
        background: "transparent", border: "1.5px solid var(--border-color)", color: "var(--text-muted)",
        padding: "6px 12px", borderRadius: "8px", cursor: "pointer", fontWeight: "600", fontSize: "0.82rem",
    },
    historyToggleActive: {
        background: "var(--primary-light)", border: "1.5px solid var(--primary)", color: "var(--primary)",
    },
    actionBtns: { display: "flex", alignItems: "center", justifyContent: "center", gap: "12px" },
    actionBtnsMain: { display: "flex", gap: "5px", alignItems: "center" },
    transferCard: {
        background: "var(--bg-color)", border: "1px solid var(--border-color)", borderRadius: "12px",
        padding: "14px 16px", marginBottom: "10px", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap",
    },
    transferTitle: { margin: "0 0 2px", color: "var(--text-main)", fontWeight: "700", fontSize: "0.9rem" },
    transferMeta: { margin: "0 0 2px", color: "var(--text-muted)", fontSize: "0.82rem" },
    approveBtn: {
        background: "var(--success)", color: "#fff", border: "none",
        padding: "7px 14px", borderRadius: "8px", cursor: "pointer", fontWeight: "700", fontSize: "0.82rem",
    },
    rejectTransferBtn: {
        background: "transparent", color: "var(--danger)", border: "1px solid var(--danger)",
        padding: "6px 12px", borderRadius: "8px", cursor: "pointer", fontWeight: "700", fontSize: "0.82rem",
    },
    assignBtn: {
        background: "var(--primary)", color: "#fff", border: "none",
        padding: "5px 9px", borderRadius: "6px", cursor: "pointer", fontSize: "0.76rem", fontWeight: "600", whiteSpace: "nowrap",
    },
    assignBtnDisabled: { background: "var(--border-color)", cursor: "not-allowed", },
    viewAssignedBtn: {
        background: "var(--primary-light)", color: "var(--primary)", border: "none",
        padding: "5px 9px", borderRadius: "6px", cursor: "pointer", fontSize: "0.76rem", fontWeight: "600", whiteSpace: "nowrap",
    },
    assignedRow: {
        display: "flex", alignItems: "center", gap: "12px",
        padding: "10px 12px", background: "var(--bg-color)",
        borderRadius: "10px", border: "1px solid var(--card-border)",
    },
    typeBadge: {
        display: "inline-block", padding: "1px 7px", borderRadius: "999px",
        fontSize: "0.7rem", fontWeight: "700",
    },
    typeBadgeRequest: { background: "var(--success-bg)", color: "var(--success)" },
    typeBadgeManual: { background: "var(--primary-light)", color: "var(--primary)" },
    removeBtn: {
        background: "var(--danger-bg)", color: "var(--danger)", border: "none",
        padding: "5px 10px", borderRadius: "6px", cursor: "pointer", fontSize: "0.78rem", fontWeight: "600", flexShrink: 0,
    },
    editBtn: {
        background: "var(--primary-light)", color: "var(--primary)", border: "none",
        padding: "5px 9px", borderRadius: "6px", cursor: "pointer", fontSize: "0.76rem", fontWeight: "600", whiteSpace: "nowrap",
    },
    deleteBtn: {
        background: "var(--danger-bg)", color: "var(--danger)", border: "none",
        padding: "5px 9px", borderRadius: "6px", cursor: "pointer", fontSize: "0.76rem", fontWeight: "600", whiteSpace: "nowrap",
    },
    warnBtn: {
        background: "var(--warning-bg)", color: "var(--warning)", border: "none",
        padding: "6px 10px", borderRadius: "8px", cursor: "pointer", fontSize: "0.8rem", fontWeight: "600",
    },
    slotsEditor: { display: "flex", alignItems: "center", gap: "4px", justifyContent: "center" },
    slotBtn: {
        background: "var(--card-bg)", color: "var(--text-main)", border: "1px solid var(--border-color)",
        width: "26px", height: "26px", borderRadius: "6px", cursor: "pointer", fontWeight: "700", fontSize: "1rem", lineHeight: 1,
    },
    slotsNum: {
        minWidth: "24px", textAlign: "center", fontWeight: "700", color: "var(--text-main)", fontSize: "0.9rem",
    },
    saveBtn: {
        background: "var(--success-bg)", color: "var(--success)", border: "none",
        padding: "4px 8px", borderRadius: "6px", cursor: "pointer", fontWeight: "700", fontSize: "0.85rem",
    },
    activateBtn: {
        background: "var(--success-bg)", color: "var(--success)", border: "none",
        padding: "6px 10px", borderRadius: "8px", cursor: "pointer", fontSize: "0.8rem", fontWeight: "600",
    },
    settingsBlock: { maxWidth: "480px", },
    fieldGroup: { display: "flex", flexDirection: "column", gap: "6px", },
    settingsLabel: { margin: "0 0 6px", color: "var(--text-main)", fontSize: "1rem", fontWeight: "700", },
    settingsHint: { margin: "0 0 20px", color: "var(--text-muted)", fontSize: "0.88rem", lineHeight: "1.5", },
    settingsForm: { display: "flex", flexDirection: "column", gap: "12px", },
    codeRow: { display: "flex", gap: "8px", },
    codeInput: {
        flex: 1, padding: "11px 14px", border: "1.5px solid var(--border-color)", borderRadius: "10px",
        fontSize: "1rem", background: "var(--input-bg)", color: "var(--text-main)", letterSpacing: "0.1em",
    },
    codeToggleBtn: {
        background: "var(--card-bg)", color: "var(--text-muted)", border: "1.5px solid var(--border-color)",
        padding: "0 16px", borderRadius: "10px", cursor: "pointer", fontWeight: "600", fontSize: "0.85rem",
    },
    codeCurrentHint: { margin: 0, color: "var(--text-muted)", fontSize: "0.85rem", },
    nextWeekNotice: {
        display: "flex", alignItems: "flex-start", gap: "12px",
        background: "var(--primary-light)", border: "1.5px solid var(--primary)",
        borderRadius: "12px", padding: "14px 16px", marginBottom: "20px",
        color: "var(--primary)",
    },
    historySectionLabel: {
        color: "var(--text-muted)", fontSize: "0.82rem", fontWeight: "700", textTransform: "uppercase",
        letterSpacing: "0.05em", margin: 0, paddingBottom: "8px",
    },
    scheduleNavBtn: {
        background: "var(--card-bg)", border: "1.5px solid var(--border-color)", color: "var(--text-muted)",
        width: "32px", height: "32px", borderRadius: "8px", cursor: "pointer",
        flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background 0.15s, color 0.15s, border-color 0.15s",
    },
    empty: { textAlign: "center", color: "var(--text-muted)", padding: "40px 0" },
    toast: {
        position: "fixed", bottom: "24px", right: "24px", background: "var(--card-bg)", color: "var(--text-main)",
        padding: "14px 18px", borderRadius: "12px", boxShadow: "var(--card-shadow)", zIndex: 500, maxWidth: "320px",
        border: "1px solid var(--border-color)", backdropFilter: "blur(12px)",
    },
    toastMsg: { margin: "4px 0 0", fontSize: "0.85rem", color: "var(--text-muted)" },
    modalOverlay: {
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, backdropFilter: "blur(4px)",
    },
    modalBox: {
        background: "var(--bg-color)", borderRadius: "16px", padding: "28px 24px",
        width: "100%", maxWidth: "380px", border: "1px solid var(--border-color)",
    },
    modalHeader: {
        display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px",
    },
    modalCloseBtn: {
        background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)",
        fontSize: "1.1rem", lineHeight: 1, padding: "4px", borderRadius: "6px",
        transition: "color 0.15s ease",
    },
    modalTitle: { margin: "0 0 20px", color: "var(--text-main)", fontSize: "1.1rem", fontWeight: "800" },
    modalForm: { display: "flex", flexDirection: "column", gap: "12px" },
    modalInput: {
        background: "var(--input-bg)", border: "1px solid var(--border-color)", borderRadius: "8px",
        padding: "10px 14px", color: "var(--text-main)", fontSize: "1rem", width: "100%", boxSizing: "border-box", outline: "none",
    },
    modalError: { margin: 0, color: "var(--danger)", fontSize: "0.85rem" },
    modalSuccess: { margin: 0, color: "var(--success)", fontSize: "0.85rem" },
    modalActions: { display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "4px" },
    modalCancel: {
        background: "var(--card-bg)", color: "var(--text-muted)", border: "1px solid var(--border-color)",
        padding: "9px 16px", borderRadius: "8px", cursor: "pointer", fontWeight: "700",
        transition: "transform 0.15s ease, filter 0.15s ease",
    },
    modalSave: {
        background: "var(--primary)", color: "#fff", border: "none",
        padding: "9px 20px", borderRadius: "8px", cursor: "pointer", fontWeight: "700",
        transition: "transform 0.15s ease, filter 0.15s ease",
    },
};

export default AdminPage;
