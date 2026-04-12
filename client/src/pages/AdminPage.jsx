import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useSocket } from "../hooks/useSocket.js";
import {
    getShifts, getRequests, deleteShift, updateShift, closeWeek, reviewRequest,
    getUsers, toggleUser, deleteUser, getRegisterCode, updateRegisterCode, changePassword, assignShift,
    getTransfers, reviewTransfer,
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

const STATUS_LABEL = { OPEN: "Abierto", FULL: "Lleno", CLOSED: "Cerrado" };
const STATUS_STYLE = {
    OPEN: { background: "#dcfce7", color: "#166534" },
    FULL: { background: "#fee2e2", color: "#991b1b" },
    CLOSED: { background: "#e5e7eb", color: "#374151" },
};

function ShiftsTable({ shifts, editingShiftId, editSlots, setEditSlots, setEditingShiftId, startEditSlots, handleSaveSlots, handleDeleteShift, onAssign, userRole, emptyText, styles, muted }) {
    const cols = ["Turno", "Fecha", "Horario", "Tipo", "Cupos", "Aprobados", "Pendientes", "Estado", "Acciones"];
    return (
        <div style={styles.tableWrapper}>
            <table style={{ ...styles.table, opacity: muted ? 0.65 : 1 }}>
                <thead>
                    <tr>{cols.map((h) => <th key={h} style={styles.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                    {shifts.map((shift) => {
                        const approved = (shift.requests?.filter((r) => r.status === "APPROVED").length ?? 0) + (shift.manualAssignments?.length ?? 0);
                        const pending = shift.requests?.filter((r) => r.status === "PENDING").length ?? 0;
                        return (
                            <tr key={shift.id} style={styles.tr}>
                                <td style={styles.td}>{shift.title}</td>
                                <td style={styles.td}>
                                    {new Date(shift.date).toLocaleDateString("es-CO", {
                                        weekday: "short", month: "short", day: "numeric",
                                    })}
                                </td>
                                <td style={styles.td}>{shift.startTime} – {shift.endTime}</td>
                                <td style={styles.td}>{shift.type === "DAY" ? "Diurno" : "Nocturno"}</td>
                                <td style={styles.td}>{shift.totalSlots}</td>
                                <td style={{ ...styles.td, color: "#16a34a", fontWeight: "bold" }}>{approved}</td>
                                <td style={{ ...styles.td, color: "#b45309" }}>{pending}</td>
                                <td style={styles.td}>
                                    <span style={{ ...styles.badge, ...STATUS_STYLE[shift.status] }}>
                                        {STATUS_LABEL[shift.status]}
                                    </span>
                                </td>
                                <td style={styles.td}>
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
                                            <button style={styles.editBtn} onClick={() => startEditSlots(shift)}>Cupos</button>
                                            {shift.type === "DAY" && shift.status !== "CLOSED" && onAssign && (
                                                <button
                                                    style={{ ...styles.assignBtn, ...(shift.status === "FULL" ? styles.assignBtnDisabled : {}) }}
                                                    onClick={() => onAssign(shift.id, shift.title)}
                                                    disabled={shift.status === "FULL"}
                                                >
                                                    Asignar
                                                </button>
                                            )}
                                            {userRole === "admin" && (
                                                <button style={styles.deleteBtn} onClick={() => handleDeleteShift(shift.id)}>Eliminar</button>
                                            )}
                                        </div>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                    {shifts.length === 0 && (
                        <tr>
                            <td colSpan={9} style={{ ...styles.td, textAlign: "center", color: "#9ca3af" }}>
                                {emptyText}
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}

function AdminPage() {
    const navigate = useNavigate();
    const { user, token, logout } = useAuth();
    const [shifts, setShifts] = useState([]);
    const [shiftsUpdatedAt, setShiftsUpdatedAt] = useState(0);
    const [requests, setRequests] = useState([]);
    const [users, setUsers] = useState([]);
    const [transfers, setTransfers] = useState([]);
    const [activeTab, setActiveTab] = useState("requests");
    const [registerCode, setRegisterCode] = useState("");
    const [newCode, setNewCode] = useState("");
    const [codeVisible, setCodeVisible] = useState(false);
    const [codeLoading, setCodeLoading] = useState(false);
    const [toast, setToast] = useState(null);
    const [notifSignal, setNotifSignal] = useState(0);
    const [showCreatorModal, setShowCreatorModal] = useState(false);
    const [leaving, setLeaving] = useState(false);
    const [editingShiftId, setEditingShiftId] = useState(null);
    const [editSlots, setEditSlots] = useState(1);
    const [showHistory, setShowHistory] = useState(false);
    const [closingWeek, setClosingWeek] = useState(false);
    const [showChangePwd, setShowChangePwd] = useState(false);
    const [pwdForm, setPwdForm] = useState({ current: "", next: "", confirm: "" });
    const [pwdError, setPwdError] = useState("");
    const [pwdSuccess, setPwdSuccess] = useState("");
    const [assignModal, setAssignModal] = useState(null); // { shiftId, shiftTitle }
    const [assignForm, setAssignForm] = useState({ name: "", email: "" });
    const [assignLoading, setAssignLoading] = useState(false);

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
        }
    }, [activeTab, token, user?.role]);

    useSocket(token, {
        "shifts:refresh": () => { loadShifts(); loadRequests(); },
        "requests:refresh": () => loadRequests(),
        "transfers:refresh": () => loadTransfers(),
        "notification:new": () => setNotifSignal((s) => s + 1),
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
        if (!confirm(`¿Archivar todos los turnos de la semana ${label}?\n\nLos turnos quedarán guardados en el historial y las solicitudes pendientes serán canceladas.`)) return;
        setClosingWeek(true);
        try {
            const result = await closeWeek(token, monday);
            showToast("Semana archivada", `${result.count} turno(s) archivados correctamente.`);
            loadShifts();
            loadRequests();
        } catch (err) { showToast("Error", err.message); }
        finally { setClosingWeek(false); }
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
        if (!confirm("¿Eliminar este turno? Se cancelarán todas las solicitudes asociadas.")) return;
        try {
            await deleteShift(token, id);
            showToast("Turno eliminado");
            loadShifts();
        } catch (err) { showToast("Error", err.message); }
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

    async function handleReviewTransfer(transferId, action) {
        try {
            await reviewTransfer(token, transferId, action, "");
            showToast(action === "approve" ? "Cesión aprobada" : "Cesión rechazada");
            loadTransfers();
            loadShifts();
        } catch (err) { showToast("Error", err.message); }
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

    async function handleDeleteUser(id, name) {
        if (!confirm(`¿Eliminar permanentemente a ${name}?\n\nSe borrarán sus solicitudes y notificaciones. Esta acción no se puede deshacer.`)) return;
        try {
            await deleteUser(token, id);
            setUsers((prev) => prev.filter((u) => u.id !== id));
            showToast("Operador eliminado");
        } catch (err) { showToast("Error", err.message); }
    }

    const approvedRequests = requests.filter((r) => r.status === "APPROVED");

    return (
        <div className={leaving ? "anim-fade-out" : "anim-fade-in"} style={styles.page}>
            {toast && (
                <div className="anim-slide-right" style={styles.toast}>
                    <strong>{toast.title}</strong>
                    {toast.message && <p style={styles.toastMsg}>{toast.message}</p>}
                </div>
            )}

            {assignModal && (
                <div style={styles.modalOverlay} onClick={() => setAssignModal(null)}>
                    <div style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
                        <h3 style={styles.modalTitle}>Asignar operador fulltime</h3>
                        <p style={{ margin: "0 0 16px", color: "#94a3b8", fontSize: "0.85rem" }}>{assignModal.shiftTitle}</p>
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

            {showChangePwd && (
                <div style={styles.modalOverlay} onClick={() => setShowChangePwd(false)}>
                    <div style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
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
                        <button style={styles.pwdButton} onClick={() => { setShowChangePwd(true); setPwdError(""); setPwdSuccess(""); }}>
                            🔒 Contraseña
                        </button>
                        <button style={styles.logoutButton} onClick={handleLogout}>Cerrar sesión</button>
                        <NotificationBell token={token} refreshSignal={notifSignal} />
                    </div>
                </header>

                {/* Barra de estadísticas */}
                <div style={styles.statsBar}>
                    <div style={styles.statCard}>
                        <span style={styles.statNum}>{shifts.filter((s) => s.status === "OPEN").length}</span>
                        <span style={styles.statLabel}>Turnos abiertos</span>
                    </div>
                    <div style={styles.statCard}>
                        <span style={{ ...styles.statNum, color: "#f59e0b" }}>{requests.length}</span>
                        <span style={styles.statLabel}>Solicitudes pendientes</span>
                    </div>
                    <div style={styles.statCard}>
                        <span style={{ ...styles.statNum, color: "#16a34a" }}>{approvedRequests.length}</span>
                        <span style={styles.statLabel}>Turnos aprobados</span>
                    </div>
                    <div style={styles.statCard}>
                        <span style={styles.statNum}>{users.filter((u) => u.role === "operator" && u.active).length}</span>
                        <span style={styles.statLabel}>Operadores activos</span>
                    </div>
                </div>

                {/* Pestañas de navegación */}
                <div style={styles.tabs}>
                    {[
                        { id: "requests", label: `Solicitudes${requests.length + transfers.length > 0 ? ` (${requests.length + transfers.length})` : ""}` },
                        { id: "shifts", label: "Turnos" },
                        { id: "users", label: "Operadores" },
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
                        {transfers.length > 0 && (
                            <div style={{ marginBottom: "24px" }}>
                                <p style={{ ...styles.requestListHint, marginBottom: "10px", color: "#a78bfa", fontWeight: "700" }}>
                                    Cesiones pendientes · {transfers.length}
                                </p>
                                {transfers.map((t) => (
                                    <div key={t.id} style={styles.transferCard}>
                                        <div style={{ flex: 1 }}>
                                            <p style={styles.transferTitle}>{t.shift?.title}</p>
                                            <p style={styles.transferMeta}>
                                                {new Date(t.shift?.date).toLocaleDateString("es-CO", { weekday: "short", month: "short", day: "numeric" })}
                                                {" · "}{t.shift?.startTime} – {t.shift?.endTime}
                                            </p>
                                            <p style={styles.transferMeta}>
                                                <strong>{t.fromUser?.name}</strong> quiere ceder a <strong>{t.toName}</strong> ({t.toEmail})
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

                        {requests.length === 0 && transfers.length === 0 ? (
                            <p style={styles.empty}>No hay solicitudes pendientes.</p>
                        ) : requests.length > 0 && (
                            <div style={styles.requestList}>
                                <div style={styles.requestListHeader}>
                                    <span style={styles.requestListHint}>
                                        Ordenadas de más antigua a más reciente · {requests.length} pendiente{requests.length !== 1 ? "s" : ""}
                                    </span>
                                </div>
                                {requests.map((req, idx) => (
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

                        <ScheduleTable
                            shifts={showHistory ? shifts : shifts.filter((s) => s.status !== "CLOSED")}
                            updatedAt={shiftsUpdatedAt}
                            canExport
                            token={token}
                        />

                        {/* Control de archivar semana */}
                        {getWeeksFromShifts(shifts).length > 0 && (
                            <div style={styles.weekActions}>
                                <span style={styles.weekActionsLabel}>Archivar semana:</span>
                                <div style={styles.weekBtns}>
                                    {getWeeksFromShifts(shifts).map(([monday, { label, count }]) => (
                                        <button
                                            key={monday}
                                            style={{ ...styles.closeWeekBtn, ...(closingWeek ? styles.exportBtnDisabled : {}) }}
                                            disabled={closingWeek}
                                            onClick={() => handleCloseWeek(monday, label)}
                                        >
                                            📁 {label} ({count} turnos)
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Botón de historial */}
                        <div style={styles.historyToggleRow}>
                            <button
                                style={{ ...styles.historyToggle, ...(showHistory ? styles.historyToggleActive : {}) }}
                                onClick={() => setShowHistory((v) => !v)}
                            >
                                {showHistory ? "🗂 Ocultando historial" : "🗂 Ver historial"}
                            </button>
                        </div>

                        {/* Tabla de turnos activos */}
                        <ShiftsTable
                            shifts={shifts.filter((s) => s.status !== "CLOSED")}
                            editingShiftId={editingShiftId}
                            editSlots={editSlots}
                            setEditSlots={setEditSlots}
                            setEditingShiftId={setEditingShiftId}
                            startEditSlots={startEditSlots}
                            handleSaveSlots={handleSaveSlots}
                            handleDeleteShift={handleDeleteShift}
                            onAssign={(shiftId, shiftTitle) => { setAssignModal({ shiftId, shiftTitle }); setAssignForm({ name: "", email: "" }); }}
                            userRole={user?.role}
                            emptyText="No hay turnos activos"
                            styles={styles}
                        />

                        {/* Historial de turnos cerrados */}
                        {showHistory && (
                            <div style={{ marginTop: "28px" }}>
                                <p style={styles.historySectionLabel}>Historial — turnos cerrados</p>
                                <ShiftsTable
                                    shifts={shifts.filter((s) => s.status === "CLOSED")}
                                    editingShiftId={editingShiftId}
                                    editSlots={editSlots}
                                    setEditSlots={setEditSlots}
                                    setEditingShiftId={setEditingShiftId}
                                    startEditSlots={startEditSlots}
                                    handleSaveSlots={handleSaveSlots}
                                    handleDeleteShift={handleDeleteShift}
                                    userRole={user?.role}
                                    emptyText="No hay turnos cerrados"
                                    styles={styles}
                                    muted
                                />
                            </div>
                        )}
                    </section>
                )}

                {activeTab === "users" && (
                    <section style={styles.section}>
                        <h2 style={styles.sectionTitle}>Operadores del equipo</h2>

                        <div style={styles.tableWrapper}>
                            <table style={styles.table}>
                                <thead>
                                    <tr>
                                        {["Nombre", "Correo", "Estado", "Acciones"].map((h) => (
                                            <th key={h} style={styles.th}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.filter((u) => u.role === "operator").map((u) => (
                                        <tr key={u.id} style={styles.tr}>
                                            <td style={styles.td}>{u.name}</td>
                                            <td style={styles.td}>{u.email}</td>
                                            <td style={styles.td}>
                                                <span style={{
                                                    ...styles.badge,
                                                    ...(u.active
                                                        ? { background: "#dcfce7", color: "#166534" }
                                                        : { background: "#fee2e2", color: "#991b1b" }),
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
                                            <td colSpan={4} style={{ ...styles.td, textAlign: "center", color: "#9ca3af" }}>
                                                No hay operadores registrados
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
                            <h3 style={styles.settingsLabel}>Código de acceso para registro</h3>
                            <p style={styles.settingsHint}>
                                Los operadores deben ingresar este código al crear su cuenta. Cámbialo cuando quieras revocar el acceso a nuevos registros.
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

                    </section>
                )}
            </div>

            {showCreatorModal && (
                <ShiftCreatorModal
                    token={token}
                    onClose={() => setShowCreatorModal(false)}
                    onCreated={(msg) => { showToast(msg); loadShifts(); }}
                />
            )}
        </div>
    );
}

const styles = {
    page: {
        minHeight: "100vh",
        background: "linear-gradient(180deg, #111827 0%, #1f2937 100%)",
        fontFamily: "Arial, sans-serif",
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
    title: { margin: 0, color: "#ffffff", fontSize: "1.8rem", fontWeight: "800" },
    subtitle: { margin: "6px 0 0", color: "#9ca3af", fontSize: "0.9rem" },
    headerActions: { display: "flex", gap: "10px", alignItems: "center" },
    pwdButton: {
        background: "#334155", color: "#e2e8f0", border: "none",
        padding: "10px 16px", borderRadius: "10px", cursor: "pointer",
        fontWeight: "bold", fontSize: "0.85rem",
    },
    logoutButton: {
        background: "#ef4444",
        color: "#fff",
        border: "none",
        padding: "10px 16px",
        borderRadius: "10px",
        cursor: "pointer",
        fontWeight: "bold",
    },
    statsBar: {
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "8px",
        marginBottom: "16px",
    },
    statCard: {
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "12px",
        padding: "10px 6px",
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        alignItems: "center",
    },
    statNum: { fontSize: "1.5rem", fontWeight: "800", color: "#f1f5f9" },
    statLabel: { fontSize: "0.68rem", color: "#94a3b8", textAlign: "center", lineHeight: "1.2" },
    tabs: { display: "flex", gap: "6px", marginBottom: "20px" },
    tab: {
        padding: "10px 18px",
        borderRadius: "10px",
        border: "1.5px solid rgba(255,255,255,0.15)",
        background: "transparent",
        color: "#94a3b8",
        cursor: "pointer",
        fontWeight: "600",
        fontSize: "0.9rem",
    },
    tabActive: {
        background: "#2563eb",
        border: "1.5px solid #2563eb",
        color: "#ffffff",
    },
    section: {
        background: "#111827",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "18px",
        padding: "24px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
    },
    sectionHeader: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "20px",
        flexWrap: "wrap",
        gap: "12px",
    },
    sectionTitle: { margin: 0, color: "#f1f5f9", fontSize: "1.15rem" },
    requestList: {
        display: "flex",
        flexDirection: "column",
        gap: "8px",
    },
    requestListHeader: {
        marginBottom: "4px",
    },
    requestListHint: {
        color: "#64748b",
        fontSize: "0.78rem",
    },
    createButton: {
        background: "#2563eb",
        color: "#fff",
        border: "none",
        padding: "10px 16px",
        borderRadius: "10px",
        cursor: "pointer",
        fontWeight: "bold",
        fontSize: "0.9rem",
    },
    form: {
        background: "#1e293b",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "14px",
        padding: "20px",
        marginBottom: "20px",
    },
    formTitle: { margin: "0 0 16px", color: "#f1f5f9", fontSize: "1rem" },
    formGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        gap: "12px",
        marginBottom: "16px",
    },
    formField: { display: "flex", flexDirection: "column", gap: "4px" },
    formLabel: { fontSize: "0.82rem", fontWeight: "600", color: "#94a3b8" },
    formInput: {
        padding: "9px 12px",
        border: "1.5px solid #334155",
        borderRadius: "8px",
        fontSize: "0.9rem",
        outline: "none",
        background: "#0f172a",
        color: "#f1f5f9",
    },
    formActions: { display: "flex", gap: "8px" },
    cancelBtn: {
        background: "#e5e7eb",
        color: "#374151",
        border: "none",
        padding: "10px 16px",
        borderRadius: "10px",
        cursor: "pointer",
        fontWeight: "bold",
        fontSize: "0.9rem",
    },
    tableWrapper: { overflowX: "auto", marginTop: "4px" },
    table: { width: "100%", borderCollapse: "collapse" },
    th: {
        textAlign: "left",
        padding: "10px 12px",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        color: "#64748b",
        background: "transparent",
        fontSize: "0.85rem",
        fontWeight: "700",
    },
    tr: { borderBottom: "1px solid rgba(255,255,255,0.05)" },
    td: { padding: "12px", color: "#e2e8f0", fontSize: "0.9rem" },
    badge: {
        padding: "4px 10px",
        borderRadius: "999px",
        fontSize: "0.8rem",
        fontWeight: "bold",
        whiteSpace: "nowrap",
    },
    weekActions: {
        background: "#fef9c3",
        border: "1px solid #fde68a",
        borderRadius: "12px",
        padding: "12px 16px",
        marginBottom: "16px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        flexWrap: "wrap",
    },
    weekActionsLabel: {
        fontWeight: "700",
        color: "#92400e",
        fontSize: "0.85rem",
        whiteSpace: "nowrap",
    },
    weekBtns: {
        display: "flex",
        gap: "8px",
        flexWrap: "wrap",
    },
    closeWeekBtn: {
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
    historyToggleRow: {
        display: "flex",
        justifyContent: "flex-end",
        marginBottom: "12px",
    },
    historyToggle: {
        background: "transparent",
        border: "1.5px solid rgba(255,255,255,0.2)",
        color: "#94a3b8",
        padding: "6px 12px",
        borderRadius: "8px",
        cursor: "pointer",
        fontWeight: "600",
        fontSize: "0.82rem",
    },
    historyToggleActive: {
        background: "#eff6ff",
        border: "1.5px solid #2563eb",
        color: "#2563eb",
    },
    actionBtns: {
        display: "flex",
        gap: "6px",
        flexWrap: "wrap",
    },
    transferCard: {
        background: "rgba(167,139,250,0.08)",
        border: "1px solid rgba(167,139,250,0.3)",
        borderRadius: "12px",
        padding: "14px 16px",
        marginBottom: "10px",
        display: "flex",
        alignItems: "center",
        gap: "16px",
        flexWrap: "wrap",
    },
    transferTitle: { margin: "0 0 2px", color: "#f1f5f9", fontWeight: "700", fontSize: "0.9rem" },
    transferMeta: { margin: "0 0 2px", color: "#94a3b8", fontSize: "0.82rem" },
    approveBtn: {
        background: "#16a34a", color: "#fff", border: "none",
        padding: "7px 14px", borderRadius: "8px", cursor: "pointer", fontWeight: "700", fontSize: "0.82rem",
    },
    rejectTransferBtn: {
        background: "transparent", color: "#f87171", border: "1px solid #f87171",
        padding: "6px 12px", borderRadius: "8px", cursor: "pointer", fontWeight: "700", fontSize: "0.82rem",
    },
    assignBtn: {
        background: "#7c3aed",
        color: "#fff",
        border: "none",
        padding: "5px 10px",
        borderRadius: "6px",
        cursor: "pointer",
        fontSize: "0.78rem",
        fontWeight: "600",
    },
    assignBtnDisabled: {
        background: "#c4b5fd",
        cursor: "not-allowed",
    },
    editBtn: {
        background: "#eff6ff",
        color: "#2563eb",
        border: "none",
        padding: "6px 10px",
        borderRadius: "8px",
        cursor: "pointer",
        fontSize: "0.8rem",
        fontWeight: "600",
    },
    deleteBtn: {
        background: "#fee2e2",
        color: "#dc2626",
        border: "none",
        padding: "6px 10px",
        borderRadius: "8px",
        cursor: "pointer",
        fontSize: "0.8rem",
        fontWeight: "600",
    },
    warnBtn: {
        background: "#fef9c3",
        color: "#92400e",
        border: "none",
        padding: "6px 10px",
        borderRadius: "8px",
        cursor: "pointer",
        fontSize: "0.8rem",
        fontWeight: "600",
    },
    slotsEditor: {
        display: "flex",
        alignItems: "center",
        gap: "4px",
    },
    slotBtn: {
        background: "#e5e7eb",
        color: "#374151",
        border: "none",
        width: "26px",
        height: "26px",
        borderRadius: "6px",
        cursor: "pointer",
        fontWeight: "700",
        fontSize: "1rem",
        lineHeight: 1,
    },
    slotsNum: {
        minWidth: "24px",
        textAlign: "center",
        fontWeight: "700",
        color: "#f1f5f9",
        fontSize: "0.9rem",
    },
    saveBtn: {
        background: "#dcfce7",
        color: "#16a34a",
        border: "none",
        padding: "4px 8px",
        borderRadius: "6px",
        cursor: "pointer",
        fontWeight: "700",
        fontSize: "0.85rem",
    },
    activateBtn: {
        background: "#dcfce7",
        color: "#16a34a",
        border: "none",
        padding: "6px 10px",
        borderRadius: "8px",
        cursor: "pointer",
        fontSize: "0.8rem",
        fontWeight: "600",
    },
    settingsBlock: {
        maxWidth: "480px",
    },
    fieldGroup: {
        display: "flex",
        flexDirection: "column",
        gap: "6px",
    },
    settingsLabel: {
        margin: "0 0 6px",
        color: "#f1f5f9",
        fontSize: "1rem",
        fontWeight: "700",
    },
    settingsHint: {
        margin: "0 0 20px",
        color: "#64748b",
        fontSize: "0.88rem",
        lineHeight: "1.5",
    },
    settingsForm: {
        display: "flex",
        flexDirection: "column",
        gap: "12px",
    },
    codeRow: {
        display: "flex",
        gap: "8px",
    },
    codeInput: {
        flex: 1,
        padding: "11px 14px",
        border: "1.5px solid #334155",
        borderRadius: "10px",
        fontSize: "1rem",
        background: "#0f172a",
        color: "#f1f5f9",
        letterSpacing: "0.1em",
    },
    codeToggleBtn: {
        background: "rgba(255,255,255,0.07)",
        color: "#94a3b8",
        border: "1.5px solid #334155",
        padding: "0 16px",
        borderRadius: "10px",
        cursor: "pointer",
        fontWeight: "600",
        fontSize: "0.85rem",
    },
    codeCurrentHint: {
        margin: 0,
        color: "#64748b",
        fontSize: "0.85rem",
    },
    historySectionLabel: {
        color: "#64748b",
        fontSize: "0.82rem",
        fontWeight: "700",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        marginBottom: "10px",
        paddingBottom: "8px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
    },
    empty: { textAlign: "center", color: "#9ca3af", padding: "40px 0" },
    toast: {
        position: "fixed",
        bottom: "24px",
        right: "24px",
        background: "#1e293b",
        color: "#f1f5f9",
        padding: "14px 18px",
        borderRadius: "12px",
        boxShadow: "0 8px 30px rgba(0,0,0,0.3)",
        zIndex: 200,
        maxWidth: "320px",
        border: "1px solid #334155",
    },
    toastMsg: { margin: "4px 0 0", fontSize: "0.85rem", color: "#94a3b8" },
    modalOverlay: {
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300,
    },
    modalBox: {
        background: "#1e293b", borderRadius: "16px", padding: "28px 24px",
        width: "100%", maxWidth: "380px", border: "1px solid #334155",
    },
    modalTitle: { margin: "0 0 20px", color: "#f1f5f9", fontSize: "1.1rem", fontWeight: "800" },
    modalForm: { display: "flex", flexDirection: "column", gap: "12px" },
    modalInput: {
        background: "#0f172a", border: "1px solid #334155", borderRadius: "8px",
        padding: "10px 14px", color: "#f1f5f9", fontSize: "0.9rem", width: "100%", boxSizing: "border-box",
    },
    modalError: { margin: 0, color: "#f87171", fontSize: "0.85rem" },
    modalSuccess: { margin: 0, color: "#4ade80", fontSize: "0.85rem" },
    modalActions: { display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "4px" },
    modalCancel: {
        background: "#334155", color: "#94a3b8", border: "none",
        padding: "9px 16px", borderRadius: "8px", cursor: "pointer", fontWeight: "700",
    },
    modalSave: {
        background: "#3b82f6", color: "#fff", border: "none",
        padding: "9px 20px", borderRadius: "8px", cursor: "pointer", fontWeight: "700",
    },
};

export default AdminPage;
