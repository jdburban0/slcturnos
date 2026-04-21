import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { useSocket } from "../hooks/useSocket.js";
import { getShifts, requestShift, cancelRequest, changePassword, requestTransfer, requestWithdrawal, getColleagues, desistManualAssignment, transferManualAssignment } from "../api/index.js";
import ShiftCard from "../components/ShiftCard.jsx";
import NotificationBell from "../components/NotificationBell.jsx";
import ScheduleTable from "../components/ScheduleTable.jsx";

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function groupByDay(shifts) {
    const map = new Map();
    for (const s of shifts) {
        const key = s.date.slice(0, 10);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(s);
    }
    for (const [key, list] of map) {
        map.set(key, list.sort((a, b) => (a.type === "DAY" ? -1 : 1) - (b.type === "DAY" ? -1 : 1)));
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function dayLabel(isoDate) {
    const [y, m, d] = isoDate.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    if (date.getTime() === today.getTime()) return "Hoy";
    if (date.getTime() === tomorrow.getTime()) return "Mañana";
    return `${DAY_NAMES[date.getDay()]} ${d} de ${date.toLocaleString("es-CO", { month: "long" })}`;
}

function WeekStrip({ shifts, selectedDay, onSelectDay }) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = [...new Set(shifts.map((s) => s.date.slice(0, 10)))].sort();
    if (days.length === 0) return null;

    return (
        <div style={stripStyles.row}>
            {days.map((iso) => {
                const [y, m, d] = iso.split("-").map(Number);
                const date = new Date(y, m - 1, d);
                const isToday = date.getTime() === today.getTime();
                const isSelected = selectedDay === iso;
                const dayName = DAY_NAMES[date.getDay()].slice(0, 3);
                const hasOpen = shifts.some((s) => s.date.slice(0, 10) === iso && s.status === "OPEN");

                return (
                    <button
                        key={iso}
                        onClick={() => onSelectDay(isSelected ? null : iso)}
                        style={{
                            ...stripStyles.btn,
                            ...(isSelected ? stripStyles.btnSelected : {}),
                            ...(isToday && !isSelected ? stripStyles.btnToday : {}),
                        }}
                    >
                        <span style={stripStyles.dayName}>{dayName}</span>
                        <span style={stripStyles.dayNum}>{d}</span>
                        {hasOpen && <div style={{ ...stripStyles.dot, background: isSelected ? "var(--text-inverse)" : "var(--primary)" }} />}
                    </button>
                );
            })}
        </div>
    );
}

const stripStyles = {
    row: { display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap" },
    btn: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "2px",
        padding: "12px 18px",
        borderRadius: "12px",
        border: "1px solid var(--card-border)",
        background: "var(--card-bg)",
        cursor: "pointer",
        minWidth: "64px",
        color: "var(--text-muted)",
        transition: "all 0.2s ease"
    },
    btnSelected: { background: "var(--primary)", border: "1px solid var(--primary)", color: "#fff" },
    btnToday: { border: "1.5px solid var(--primary-hover)", color: "var(--primary-hover)" },
    dayName: { fontSize: "0.65rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.04em" },
    dayNum: { fontSize: "1.5rem", fontWeight: "800", lineHeight: 1 },
    dot: { width: "5px", height: "5px", borderRadius: "50%", marginTop: "2px" },
};

function DashboardPage() {
    const navigate = useNavigate();
    const { user, token, logout } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const [shifts, setShifts] = useState([]);
    const [shiftsUpdatedAt, setShiftsUpdatedAt] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [toast, setToast] = useState(null);
    const [notifSignal, setNotifSignal] = useState(0);
    const [leaving, setLeaving] = useState(false);
    const [selectedDay, setSelectedDay] = useState(null);
    const [showChangePwd, setShowChangePwd] = useState(false);
    const [pwdForm, setPwdForm] = useState({ current: "", next: "", confirm: "" });
    const [pwdError, setPwdError] = useState("");
    const [pwdSuccess, setPwdSuccess] = useState("");
    const [desistModal, setDesistModal] = useState(null); // { requestId, shiftTitle }
    const [desistMode, setDesistMode] = useState("choose"); // "choose" | "transfer"
    const [colleagues, setColleagues] = useState([]);
    const [selectedColleague, setSelectedColleague] = useState(null);
    const [transferLoading, setTransferLoading] = useState(false);
    const [dashTab, setDashTab] = useState("upcoming");

    const loadShifts = useCallback(async () => {
        try {
            const data = await getShifts(token);
            setShifts(data);
            setShiftsUpdatedAt(Date.now());
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => { loadShifts(); }, [loadShifts]);

    useSocket(token, {
        "shifts:refresh": () => loadShifts(),
        "notification:new": (notif) => {
            setNotifSignal((s) => s + 1);
            showToast(notif?.title || "Nueva notificación", notif?.message || "");
        },
        "force:logout": () => {
            logout();
            navigate("/login");
        },
    });

    useEffect(() => {
        if (!selectedDay) return;
        const el = document.getElementById(`day-${selectedDay}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, [selectedDay]);

    function showToast(title, message) {
        setToast({ title, message });
        setTimeout(() => setToast(null), 5000);
    }

    async function handleRequest(shiftId) {
        try {
            await requestShift(token, shiftId);
            showToast("Solicitud enviada", "Tu solicitud está pendiente de revisión.");
            loadShifts();
        } catch (err) { showToast("Error", err.message); }
    }

    async function handleCancelRequest(requestId) {
        try {
            await cancelRequest(token, requestId);
            showToast("Solicitud cancelada", "");
            loadShifts();
        } catch (err) { showToast("Error", err.message); }
    }

    function getMyRequest(shift) {
        return shift.requests?.find((r) => r.user?.id === user?.id) ?? null;
    }

    async function handleDesistCancel() {
        try {
            if (desistModal.assignmentId) {
                await desistManualAssignment(token, desistModal.shiftId, desistModal.assignmentId);
                showToast("Solicitud enviada", "El administrador revisará tu desistimiento.");
            } else {
                await requestWithdrawal(token, desistModal.requestId);
                showToast("Solicitud enviada", "El administrador revisará tu desistimiento.");
            }
            setDesistModal(null);
        } catch (err) { showToast("Error", err.message); }
    }

    async function handleTransferSubmit(e) {
        e.preventDefault();
        if (!selectedColleague) return;
        setTransferLoading(true);
        try {
            if (desistModal.assignmentId) {
                await transferManualAssignment(token, desistModal.shiftId, desistModal.assignmentId, selectedColleague.name, selectedColleague.email);
                showToast("Traspaso enviado", "El administrador revisará la solicitud.");
            } else {
                await requestTransfer(token, desistModal.requestId, selectedColleague.name, selectedColleague.email);
                showToast("Traspaso enviado", "El administrador revisará la solicitud.");
            }
            setDesistModal(null);
            setSelectedColleague(null);
            loadShifts();
        } catch (err) { showToast("Error", err.message); }
        finally { setTransferLoading(false); }
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

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const upcomingShifts = shifts.filter((s) => s.status !== "CLOSED" && new Date(s.date.slice(0,10)+"T12:00:00") >= today);

    // Current week (Mon-Sun) CLOSED shifts
    const dayOfWeek = today.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const currentWeekMonday = new Date(today); currentWeekMonday.setDate(today.getDate() + diffToMonday);
    const currentWeekSunday = new Date(currentWeekMonday); currentWeekSunday.setDate(currentWeekMonday.getDate() + 6);
    const currentWeekShifts = shifts.filter((s) => {
        const d = new Date(s.date.slice(0, 10) + "T12:00:00");
        return s.status === "CLOSED" && d >= currentWeekMonday && d <= currentWeekSunday;
    });
    const activeShifts = dashTab === "current" ? currentWeekShifts : upcomingShifts;
    const myApprovedShifts = activeShifts.filter((s) =>
        s.requests?.some((r) => r.user?.id === user?.id && r.status === "APPROVED")
    );
    const myPendingCount = activeShifts.filter((s) =>
        s.requests?.some((r) => r.user?.id === user?.id && r.status === "PENDING")
    ).length;
    const openShiftsCount = activeShifts.filter((s) => s.status === "OPEN").length;

    const grouped = groupByDay(upcomingShifts);
    const visibleGroups = selectedDay
        ? grouped.filter(([date]) => date === selectedDay)
        : grouped;

    return (
        <div className={leaving ? "anim-fade-out" : "anim-fade-in"} style={styles.page}>
            {toast && (
                <div className="anim-slide-right" style={styles.toast}>
                    <strong>{toast.title}</strong>
                    {toast.message && <p style={styles.toastMsg}>{toast.message}</p>}
                </div>
            )}

            {desistModal && (
                <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={() => setDesistModal(null)}>
                    <div className="modal-box-anim" style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
                        <h3 style={styles.modalTitle}>Desistir del turno</h3>
                        <p style={{ margin: "0 0 16px", color: "var(--text-muted)", fontSize: "0.85rem" }}>{desistModal.shiftTitle}</p>

                        {desistMode === "choose" && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                                <button style={styles.modalSave} onClick={() => setDesistMode("transfer")}>
                                    Pasar el turno a un compañero
                                </button>
                                <button style={{ ...styles.modalCancel, background: "var(--danger-bg)", color: "var(--danger)", border: "none" }} onClick={handleDesistCancel}>
                                    Solo liberar mi cupo
                                </button>
                                <button style={styles.modalCancel} onClick={() => setDesistModal(null)}>
                                    Volver
                                </button>
                            </div>
                        )}

                        {desistMode === "transfer" && (
                            <form onSubmit={handleTransferSubmit} style={styles.modalForm}>
                                <p style={{ margin: "0 0 10px", color: "var(--text-muted)", fontSize: "0.82rem" }}>
                                    Selecciona un compañero. El traspaso queda pendiente de aprobación.
                                </p>
                                <div style={styles.colleagueList}>
                                    {colleagues.length === 0 && (
                                        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: 0 }}>No hay compañeros disponibles.</p>
                                    )}
                                    {colleagues.map((c) => (
                                        <div
                                            key={c.id}
                                            style={{ ...styles.colleagueItem, ...(selectedColleague?.id === c.id ? styles.colleagueItemSelected : {}) }}
                                            onClick={() => setSelectedColleague(c)}
                                        >
                                            <span style={styles.colleagueName}>{c.name}</span>
                                            <span style={styles.colleagueEmail}>{c.email}</span>
                                        </div>
                                    ))}
                                </div>
                                <div style={styles.modalActions}>
                                    <button type="button" style={styles.modalCancel} onClick={() => setDesistMode("choose")}>Atrás</button>
                                    <button type="submit" style={styles.modalSave} disabled={transferLoading || !selectedColleague}>
                                        {transferLoading ? "Enviando..." : "Solicitar traspaso"}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {showChangePwd && (
                <div className="modal-overlay-anim" style={styles.modalOverlay} onClick={() => setShowChangePwd(false)}>
                    <div className="modal-box-anim" style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
                        <h3 style={styles.modalTitle}>Cambiar contraseña</h3>
                        <form onSubmit={handleChangePwd} style={styles.modalForm}>
                            <input
                                style={styles.modalInput}
                                type="password"
                                placeholder="Contraseña actual"
                                value={pwdForm.current}
                                onChange={(e) => setPwdForm((f) => ({ ...f, current: e.target.value }))}
                                required
                            />
                            <input
                                style={styles.modalInput}
                                type="password"
                                placeholder="Nueva contraseña"
                                value={pwdForm.next}
                                onChange={(e) => setPwdForm((f) => ({ ...f, next: e.target.value }))}
                                required
                            />
                            <input
                                style={styles.modalInput}
                                type="password"
                                placeholder="Confirmar nueva contraseña"
                                value={pwdForm.confirm}
                                onChange={(e) => setPwdForm((f) => ({ ...f, confirm: e.target.value }))}
                                required
                            />
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
                        <h1 style={styles.title}>SLC Turnos</h1>
                        <p style={styles.subtitle}>Bienvenido, {user?.name}</p>
                    </div>
                    <div style={styles.headerActions}>
                        <button style={styles.pwdButton} onClick={() => { setShowChangePwd(true); setPwdError(""); setPwdSuccess(""); }}>
                            🔒 Contraseña
                        </button>
                        <button onClick={toggleTheme} className="theme-toggle" title="Alternar tema">
                            {theme === 'dark' ? '☀️' : '🌙'}
                        </button>
                        <button style={styles.logoutButton} onClick={() => { setLeaving(true); setTimeout(() => { logout(); navigate("/login"); }, 320); }}>
                            Cerrar sesión
                        </button>
                        <NotificationBell token={token} refreshSignal={notifSignal} />
                    </div>
                </header>

                {/* Stats */}
                <div style={styles.statsRow}>
                    <div style={styles.statCard}>
                        <span style={{ ...styles.statValue, color: "var(--success)" }}>{myApprovedShifts.length}</span>
                        <span style={styles.statLabel}>Aprobados</span>
                    </div>
                    <div style={styles.statCard}>
                        <span style={{ ...styles.statValue, color: "var(--warning)" }}>{myPendingCount}</span>
                        <span style={styles.statLabel}>Pendientes</span>
                    </div>
                    <div style={styles.statCard}>
                        <span style={{ ...styles.statValue, color: "var(--primary)" }}>
                            {dashTab === "current" ? currentWeekShifts.length : openShiftsCount}
                        </span>
                        <span style={styles.statLabel}>{dashTab === "current" ? "En curso" : "Disponibles"}</span>
                    </div>
                </div>

                {/* Tabs semana actual / próxima */}
                <div style={{ display: "flex", gap: "8px", marginBottom: "16px", overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
                    <button
                        style={{ ...styles.dashTabBtn, ...(dashTab === "upcoming" ? styles.dashTabBtnActive : {}) }}
                        onClick={() => { setDashTab("upcoming"); setSelectedDay(null); }}
                    >
                        Próxima semana
                    </button>
                    {currentWeekShifts.length > 0 && (
                        <button
                            style={{ ...styles.dashTabBtn, ...(dashTab === "current" ? styles.dashTabBtnActive : {}) }}
                            onClick={() => { setDashTab("current"); setSelectedDay(null); }}
                        >
                            Semana actual
                        </button>
                    )}
                </div>

                {/* Horario — sincronizado con el tab activo */}
                <ScheduleTable
                    shifts={dashTab === "current" ? currentWeekShifts : upcomingShifts}
                    updatedAt={shiftsUpdatedAt}
                    showAll={dashTab === "current"}
                />

                {/* Filtro por día */}
                {dashTab === "upcoming" && (
                    <WeekStrip
                        shifts={upcomingShifts}
                        selectedDay={selectedDay}
                        onSelectDay={setSelectedDay}
                    />
                )}

                {/* Turnos */}
                {loading && <p style={styles.info}>Cargando turnos...</p>}
                {error && <p style={styles.errorMsg}>{error}</p>}

                {dashTab === "upcoming" && !loading && upcomingShifts.length === 0 && (
                    <div style={styles.emptyState}>
                        <p style={styles.emptyIcon}>📋</p>
                        <p style={styles.emptyText}>No hay turnos disponibles esta semana.</p>
                        <p style={styles.emptySubtext}>El supervisor publicará los turnos pronto.</p>
                    </div>
                )}

                {dashTab === "current" && !loading && currentWeekShifts.length === 0 && (
                    <div style={styles.emptyState}>
                        <p style={styles.emptyIcon}>📋</p>
                        <p style={styles.emptyText}>No hay turnos de la semana actual.</p>
                    </div>
                )}

                {dashTab === "current" && (
                    <div style={styles.cardsGrid}>
                        {groupByDay(currentWeekShifts).map(([date, dayShifts]) => (
                            <div key={date} style={styles.dayGroup}>
                                <div style={styles.dayHeader}>
                                    <span style={styles.dayLabel}>{dayLabel(date)}</span>
                                    <span style={styles.dayCount}>{dayShifts.length} turno{dayShifts.length !== 1 ? "s" : ""}</span>
                                </div>
                                <div style={styles.list}>
                                    {dayShifts.map((shift) => (
                                        <ShiftCard
                                            key={shift.id}
                                            shift={shift}
                                            myRequest={getMyRequest(shift)}
                                            userEmail={user?.email}
                                            onRequest={handleRequest}
                                            onCancelRequest={handleCancelRequest}
                                            onDesist={async (reqId, title) => {
                                                setDesistModal({ requestId: reqId, shiftTitle: title });
                                                setDesistMode("choose");
                                                setSelectedColleague(null);
                                                try {
                                                    const list = await getColleagues(token);
                                                    const targetShift = currentWeekShifts.find((s) => s.requests?.some((r) => r.id === reqId));
                                                    const assignedEmails = new Set([
                                                        ...(targetShift?.requests?.filter((r) => r.status === "APPROVED").map((r) => r.user?.email?.toLowerCase()) ?? []),
                                                        ...(targetShift?.manualAssignments?.map((a) => a.email?.toLowerCase()) ?? []),
                                                    ]);
                                                    setColleagues(list.filter((c) => !assignedEmails.has(c.email?.toLowerCase())));
                                                } catch {}
                                            }}
                                            onDesistManual={async (assignmentId, shiftId, shiftTitle) => {
                                                setDesistModal({ assignmentId, shiftId, shiftTitle });
                                                setDesistMode("choose");
                                                setSelectedColleague(null);
                                                try {
                                                    const list = await getColleagues(token);
                                                    const targetShift = currentWeekShifts.find((s) => s.id === shiftId);
                                                    const assignedEmails = new Set([
                                                        ...(targetShift?.requests?.filter((r) => r.status === "APPROVED").map((r) => r.user?.email?.toLowerCase()) ?? []),
                                                        ...(targetShift?.manualAssignments?.map((a) => a.email?.toLowerCase()) ?? []),
                                                    ]);
                                                    setColleagues(list.filter((c) => !assignedEmails.has(c.email?.toLowerCase())));
                                                } catch {}
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div style={{ display: dashTab === "upcoming" ? undefined : "none" }}>
                <div style={styles.cardsGrid}>
                    {visibleGroups.map(([date, dayShifts]) => (
                        <div key={date} id={`day-${date}`} style={styles.dayGroup}>
                            <div style={styles.dayHeader}>
                                <span style={styles.dayLabel}>{dayLabel(date)}</span>
                                <span style={styles.dayCount}>{dayShifts.length} turno{dayShifts.length !== 1 ? "s" : ""}</span>
                            </div>
                            <div style={styles.list}>
                                {dayShifts.map((shift) => (
                                    <ShiftCard
                                        key={shift.id}
                                        shift={shift}
                                        myRequest={getMyRequest(shift)}
                                        userEmail={user?.email}
                                        onRequest={handleRequest}
                                        onCancelRequest={handleCancelRequest}
                                        onDesist={async (reqId, title) => {
                                            setDesistModal({ requestId: reqId, shiftTitle: title });
                                            setDesistMode("choose");
                                            setSelectedColleague(null);
                                            try {
                                                const list = await getColleagues(token);
                                                const targetShift = upcomingShifts.find((s) => s.requests?.some((r) => r.id === reqId));
                                                const assignedEmails = new Set([
                                                    ...(targetShift?.requests?.filter((r) => r.status === "APPROVED").map((r) => r.user?.email?.toLowerCase()) ?? []),
                                                    ...(targetShift?.manualAssignments?.map((a) => a.email?.toLowerCase()) ?? []),
                                                ]);
                                                setColleagues(list.filter((c) => !assignedEmails.has(c.email?.toLowerCase())));
                                            } catch {}
                                        }}
                                        onDesistManual={async (assignmentId, shiftId, shiftTitle) => {
                                            setDesistModal({ assignmentId, shiftId, shiftTitle });
                                            setDesistMode("choose");
                                            setSelectedColleague(null);
                                            try {
                                                const list = await getColleagues(token);
                                                const targetShift = upcomingShifts.find((s) => s.id === shiftId);
                                                const assignedEmails = new Set([
                                                    ...(targetShift?.requests?.filter((r) => r.status === "APPROVED").map((r) => r.user?.email?.toLowerCase()) ?? []),
                                                    ...(targetShift?.manualAssignments?.map((a) => a.email?.toLowerCase()) ?? []),
                                                ]);
                                                setColleagues(list.filter((c) => !assignedEmails.has(c.email?.toLowerCase())));
                                            } catch (err) { console.error("getColleagues error:", err); }
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                </div>

            </div>
        </div>
    );
}

const styles = {
    page: {
        minHeight: "100vh",
        background: "transparent",
        fontFamily: "var(--font-family)",
        padding: "28px 20px",
    },
    container: { maxWidth: "1100px", margin: "0 auto" },
    header: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "16px",
        marginBottom: "20px",
        flexWrap: "wrap",
    },
    title: { margin: 0, color: "var(--text-main)", fontSize: "1.6rem", fontWeight: "800" },
    subtitle: { margin: "4px 0 0", color: "var(--text-muted)", fontSize: "0.9rem" },
    headerActions: { display: "flex", gap: "10px", alignItems: "center" },
    pwdButton: {
        background: "var(--card-bg)",
        color: "var(--text-main)",
        border: "1px solid var(--border-color)",
        padding: "9px 14px",
        borderRadius: "9px",
        cursor: "pointer",
        fontWeight: "bold",
        fontSize: "0.85rem",
    },
    logoutButton: {
        background: "var(--danger)",
        color: "#fff",
        border: "none",
        padding: "9px 14px",
        borderRadius: "9px",
        cursor: "pointer",
        fontWeight: "bold",
        fontSize: "0.85rem",
    },
    statsRow: {
        display: "flex",
        gap: "10px",
        marginBottom: "16px",
    },
    statCard: {
        background: "var(--card-bg)",
        borderRadius: "12px",
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "4px",
        border: "1px solid var(--border-color)",
        flex: 1,
        backdropFilter: "blur(16px)",
    },
    statValue: {
        fontSize: "1.5rem",
        fontWeight: "800",
        lineHeight: 1,
    },
    statLabel: {
        fontSize: "0.65rem",
        color: "var(--text-muted)",
        fontWeight: "700",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
    },
    cardsGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 420px), 1fr))",
        gap: "0 28px",
    },
    dayGroup: { marginBottom: "20px" },
    dayHeader: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "8px",
        paddingBottom: "6px",
        borderBottom: "1px solid var(--border-color)",
    },
    dayLabel: { color: "var(--text-main)", fontWeight: "700", fontSize: "0.95rem", textTransform: "capitalize" },
    dayCount: { color: "var(--text-muted)", fontSize: "0.78rem" },
    list: { display: "flex", flexDirection: "column", gap: "8px" },
    info: { color: "var(--text-muted)", textAlign: "center", padding: "40px 0" },
    dashTabBtn: {
        padding: "9px 18px", borderRadius: "10px", border: "1.5px solid var(--border-color)",
        background: "var(--card-bg)", color: "var(--text-muted)", cursor: "pointer",
        fontWeight: "600", fontSize: "0.88rem", flexShrink: 0, transition: "all 0.18s ease",
    },
    dashTabBtnActive: {
        background: "var(--primary)", border: "1.5px solid var(--primary)", color: "#ffffff",
    },
    errorMsg: {
        background: "var(--danger-bg)",
        color: "var(--danger)",
        padding: "12px 16px",
        borderRadius: "10px",
        marginBottom: "16px",
    },
    emptyState: { textAlign: "center", padding: "60px 20px" },
    emptyIcon: { fontSize: "3rem", margin: "0 0 12px" },
    emptyText: { color: "var(--text-main)", fontSize: "1.1rem", margin: "0 0 6px" },
    emptySubtext: { color: "var(--text-muted)", fontSize: "0.9rem" },
    toast: {
        position: "fixed",
        bottom: "24px",
        right: "24px",
        background: "var(--card-bg)",
        color: "var(--text-main)",
        padding: "14px 18px",
        borderRadius: "12px",
        boxShadow: "var(--card-shadow)",
        zIndex: 200,
        maxWidth: "320px",
        border: "1px solid var(--border-color)",
        backdropFilter: "blur(12px)",
    },
    toastMsg: { margin: "4px 0 0", fontSize: "0.85rem", color: "var(--text-muted)" },
    modalOverlay: {
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300,
        backdropFilter: "blur(4px)",
    },
    modalBox: {
        background: "var(--bg-color)", borderRadius: "16px", padding: "28px 24px",
        width: "100%", maxWidth: "380px", border: "1px solid var(--border-color)",
    },
    modalTitle: { margin: "0 0 20px", color: "var(--text-main)", fontSize: "1.1rem", fontWeight: "800" },
    modalForm: { display: "flex", flexDirection: "column", gap: "12px" },
    modalInput: {
        background: "var(--input-bg)", border: "1px solid var(--border-color)", borderRadius: "8px",
        padding: "10px 14px", color: "var(--text-main)", fontSize: "0.9rem", width: "100%", outline: "none",
    },
    modalError: { margin: 0, color: "var(--danger)", fontSize: "0.85rem" },
    modalSuccess: { margin: 0, color: "var(--success)", fontSize: "0.85rem" },
    modalActions: { display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "4px" },
    colleagueList: {
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        maxHeight: "220px",
        overflowY: "auto",
        marginBottom: "4px",
    },
    colleagueItem: {
        display: "flex",
        flexDirection: "column",
        padding: "10px 12px",
        borderRadius: "8px",
        border: "1px solid var(--border-color)",
        cursor: "pointer",
        transition: "background 0.15s",
    },
    colleagueItemSelected: {
        background: "var(--primary-light)",
        border: "1px solid var(--primary)",
    },
    colleagueName: { color: "var(--text-main)", fontWeight: "700", fontSize: "0.88rem" },
    colleagueEmail: { color: "var(--text-muted)", fontSize: "0.78rem" },
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

export default DashboardPage;
