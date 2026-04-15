import { useState } from "react";

function PendingRequestCard({ request, onApprove, onReject, index }) {
    const [notes, setNotes] = useState("");
    const [showRejectForm, setShowRejectForm] = useState(false);

    const dateFormatted = new Date(request.shift.date).toLocaleDateString("es-CO", {
        weekday: "short", month: "short", day: "numeric",
    });

    const requestedAt = new Date(request.createdAt).toLocaleString("es-CO", {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });

    const timeLeft = request.holdExpiresAt
        ? Math.max(0, Math.round((new Date(request.holdExpiresAt) - Date.now()) / 60000))
        : null;

    return (
        <div className="card-lift" style={s.card}>
            {/* Fila 1: badge + operador + timer */}
            <div style={s.topRow}>
                <div style={s.indexBadge}>#{index + 1}</div>
                <div style={s.operatorInfo}>
                    <span style={s.operatorName}>{request.user.name}</span>
                    <span style={s.operatorEmail}>{request.user.email}</span>
                </div>
                {timeLeft !== null && (
                    <span style={{ ...s.timer, ...(timeLeft < 5 ? s.timerUrgent : {}) }}>
                        ⏱ {timeLeft}m
                    </span>
                )}
            </div>

            {/* Fila 2: turno + fecha */}
            <div style={s.shiftRow}>
                <span style={s.shiftTitle}>{request.shift.title}</span>
                <span style={s.shiftMeta}>
                    {dateFormatted} · {request.shift.startTime} – {request.shift.endTime}
                </span>
                <span style={s.requestedAt}>Solicitado: {requestedAt}</span>
            </div>

            {/* Fila 3: acciones */}
            <div style={s.actionsRow}>
                {!showRejectForm ? (
                    <>
                        <button style={s.approveBtn} onClick={() => onApprove(request.id)}>
                            ✓ Aprobar
                        </button>
                        <button style={s.rejectBtn} onClick={() => setShowRejectForm(true)}>
                            ✕ Rechazar
                        </button>
                    </>
                ) : (
                    <>
                        <input
                            style={s.notesInput}
                            placeholder="Motivo (opcional)"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                        />
                        <button
                            style={s.rejectBtn}
                            onClick={() => { onReject(request.id, notes); setShowRejectForm(false); }}
                        >
                            Confirmar rechazo
                        </button>
                        <button
                            style={s.cancelBtn}
                            onClick={() => { setShowRejectForm(false); setNotes(""); }}
                        >
                            Cancelar
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

const s = {
    card: {
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        padding: "14px 16px",
        background: "var(--hover-overlay)",
        borderRadius: "12px",
        border: "1px solid var(--border-color)",
    },
    // Fila 1
    topRow: {
        display: "flex",
        alignItems: "center",
        gap: "10px",
    },
    indexBadge: {
        background: "var(--border-color)",
        color: "var(--text-muted)",
        fontWeight: "800",
        fontSize: "0.78rem",
        padding: "3px 7px",
        borderRadius: "6px",
        flexShrink: 0,
    },
    operatorInfo: {
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minWidth: 0,
    },
    operatorName: {
        fontWeight: "700",
        color: "var(--text-main)",
        fontSize: "0.9rem",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
    },
    operatorEmail: {
        color: "var(--text-muted)",
        fontSize: "0.73rem",
    },
    timer: {
        background: "#fef9c3",
        color: "#92400e",
        padding: "3px 8px",
        borderRadius: "6px",
        fontSize: "0.75rem",
        fontWeight: "700",
        flexShrink: 0,
        whiteSpace: "nowrap",
    },
    timerUrgent: { background: "#fee2e2", color: "#991b1b" },
    // Fila 2
    shiftRow: {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "4px 10px",
        paddingLeft: "2px",
    },
    shiftTitle: {
        fontWeight: "700",
        color: "var(--primary)",
        fontSize: "0.88rem",
    },
    shiftMeta: {
        color: "var(--text-muted)",
        fontSize: "0.8rem",
    },
    requestedAt: {
        color: "var(--text-muted)",
        fontSize: "0.73rem",
        width: "100%",
    },
    // Fila 3
    actionsRow: {
        display: "flex",
        gap: "8px",
        flexWrap: "wrap",
        alignItems: "center",
    },
    approveBtn: {
        background: "#16a34a",
        color: "#fff",
        border: "none",
        padding: "8px 16px",
        borderRadius: "8px",
        cursor: "pointer",
        fontWeight: "700",
        fontSize: "0.85rem",
        whiteSpace: "nowrap",
        transition: "transform 0.15s ease, filter 0.15s ease",
    },
    rejectBtn: {
        background: "#dc2626",
        color: "#fff",
        border: "none",
        padding: "8px 16px",
        borderRadius: "8px",
        cursor: "pointer",
        fontWeight: "700",
        fontSize: "0.85rem",
        whiteSpace: "nowrap",
        transition: "transform 0.15s ease, filter 0.15s ease",
    },
    cancelBtn: {
        background: "var(--border-color)",
        color: "var(--text-muted)",
        border: "none",
        padding: "8px 14px",
        borderRadius: "8px",
        cursor: "pointer",
        fontWeight: "600",
        fontSize: "0.85rem",
        transition: "transform 0.15s ease, filter 0.15s ease",
    },
    notesInput: {
        padding: "7px 10px",
        border: "1px solid var(--border-color)",
        borderRadius: "7px",
        fontSize: "0.82rem",
        outline: "none",
        flex: 1,
        minWidth: "120px",
        background: "var(--input-bg)",
        color: "var(--text-main)",
    },
};

export default PendingRequestCard;
