function ShiftCard({ shift, myRequest, userEmail, onRequest, onCancelRequest, onDesist }) {
    const approvedCount = (shift.requests?.filter((r) => r.status === "APPROVED").length ?? 0)
        + (shift.manualAssignments?.length ?? 0);
    const availableSlots = shift.totalSlots - approvedCount;
    const isFull = shift.status === "FULL" || availableSlots <= 0;
    const isPending = myRequest?.status === "PENDING";
    const isApproved = myRequest?.status === "APPROVED";
    const isManualAssigned = !isApproved && !!userEmail &&
        (shift.manualAssignments?.some((a) => a.email?.toLowerCase() === userEmail.toLowerCase()) ?? false);
    const transferStatus = myRequest?.transfer?.status ?? null;
    const desistDisabled = transferStatus === "PENDING" || transferStatus === "REJECTED";

    const dateFormatted = new Date(shift.date).toLocaleDateString("es-CO", {
        weekday: "short", month: "short", day: "numeric",
    });

    let statusBg = "rgba(255,255,255,0.08)";
    let statusColor = "#94a3b8";
    let statusText = `${availableSlots} cupo${availableSlots !== 1 ? "s" : ""} libre${availableSlots !== 1 ? "s" : ""}`;

    if (isApproved || isManualAssigned) { statusBg = "#dcfce7"; statusColor = "#15803d"; statusText = "Aprobado ✓"; }
    else if (isPending) { statusBg = "#fef9c3"; statusColor = "#92400e"; statusText = "En revisión…"; }
    else if (isFull) { statusBg = "#fee2e2"; statusColor = "#b91c1c"; statusText = "Sin cupos"; }

    function getAction() {
        if (isManualAssigned) return null;
        if (isApproved) return (
            <button
                style={{ ...styles.desistBtn, ...(desistDisabled ? styles.desistBtnDisabled : {}) }}
                onClick={() => !desistDisabled && onDesist(myRequest.id, shift.title)}
                disabled={desistDisabled}
                title={transferStatus === "REJECTED" ? "Traspaso rechazado" : transferStatus === "PENDING" ? "Traspaso en revisión" : undefined}
            >
                Desistir
            </button>
        );
        if (isPending) return (
            <button style={styles.cancelBtn} onClick={() => onCancelRequest(myRequest.id)}>
                Cancelar
            </button>
        );
        if (isFull) return null;
        return (
            <button style={styles.requestBtn} onClick={() => onRequest(shift.id)}>
                Solicitar
            </button>
        );
    }

    return (
        <div style={{
            ...styles.row,
            ...(isPending ? styles.rowPending : (isApproved || isManualAssigned) ? styles.rowApproved : {}),
        }}>
            {/* Indicador de tipo */}
            <div style={{ ...styles.typeDot, background: shift.type === "DAY" ? "#f59e0b" : "#6366f1" }}
                title={shift.type === "DAY" ? "Diurno" : "Nocturno"}
            />

            {/* Información principal */}
            <div style={styles.main}>
                <span style={styles.shiftName}>{shift.title}</span>
                <div style={styles.meta}>
                    <span style={styles.metaItem}>📅 {dateFormatted}</span>
                    <span style={styles.metaDot}>·</span>
                    <span style={styles.metaItem}>🕐 {shift.startTime} – {shift.endTime}</span>
                </div>
            </div>

            {/* Estado + Acción (agrupados a la derecha) */}
            <div style={styles.rightSide}>
                <span style={{ ...styles.pill, background: statusBg, color: statusColor }}>
                    {statusText}
                </span>
                {getAction() && (
                    <div style={styles.actionArea}>
                        {getAction()}
                    </div>
                )}
            </div>
        </div>
    );
}

const styles = {
    row: {
        display: "flex",
        alignItems: "flex-start",
        gap: "14px",
        padding: "14px 18px",
        background: "rgba(255,255,255,0.05)",
        borderRadius: "12px",
        borderLeft: "4px solid transparent",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.07)",
        transition: "box-shadow 0.15s",
    },
    rowPending: { borderLeft: "4px solid #f59e0b" },
    rowApproved: { borderLeft: "4px solid #16a34a" },
    typeDot: {
        width: "10px",
        height: "10px",
        borderRadius: "50%",
        flexShrink: 0,
        marginTop: "5px",
    },
    main: {
        flex: 1,
        minWidth: 0,
    },
    shiftName: {
        display: "block",
        fontWeight: "700",
        color: "var(--text-main)",
        fontSize: "0.95rem",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
    },
    meta: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        marginTop: "3px",
        flexWrap: "wrap",
    },
    metaItem: { color: "#64748b", fontSize: "0.82rem" },
    metaDot: { color: "#cbd5e1", fontSize: "0.8rem" },
    pill: {
        padding: "4px 10px",
        borderRadius: "999px",
        fontSize: "0.78rem",
        fontWeight: "700",
        whiteSpace: "nowrap",
        flexShrink: 0,
    },
    rightSide: {
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: "8px",
        flexShrink: 0,
    },
    actionArea: { flexShrink: 0, textAlign: "right" },
    requestBtn: {
        background: "#2563eb",
        color: "#fff",
        border: "none",
        padding: "7px 14px",
        borderRadius: "8px",
        cursor: "pointer",
        fontWeight: "700",
        fontSize: "0.82rem",
    },
    cancelBtn: {
        background: "transparent",
        border: "1px solid #d97706",
        color: "#b45309",
        padding: "6px 12px",
        borderRadius: "8px",
        cursor: "pointer",
        fontWeight: "600",
        fontSize: "0.82rem",
    },
    desistBtn: {
        background: "transparent",
        border: "1px solid #ef4444",
        color: "#ef4444",
        padding: "6px 12px",
        borderRadius: "8px",
        cursor: "pointer",
        fontWeight: "600",
        fontSize: "0.82rem",
    },
    desistBtnDisabled: {
        border: "1px solid #475569",
        color: "#475569",
        cursor: "not-allowed",
        opacity: 0.6,
    },
};

export default ShiftCard;
