import { useState, useEffect, useCallback } from "react";
import { getInvitations, createInvitation, revokeInvitation } from "../api/index.js";

const DOMAIN = "@sig.systems";

function formatExpires(iso) {
    const ms = new Date(iso) - Date.now();
    if (ms <= 0) return "Expirada";
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `Expira en ${h} h ${m} min` : `Expira en ${m} min`;
}

/**
 * Pestaña "Invitar": admin puede invitar operadores y leads; lead solo operadores.
 */
export default function InviteSection({ token, role, showToast, sectionStyle, titleStyle, confirm }) {
    const isAdmin = role === "admin";
    const [inviteRole, setInviteRole] = useState("operator");
    const [email, setEmail] = useState("");
    const [error, setError] = useState("");
    const [sending, setSending] = useState(false);
    const [invitations, setInvitations] = useState([]);

    const load = useCallback(async () => {
        try { setInvitations(await getInvitations(token)); } catch { /* la lista se recarga en la próxima acción */ }
    }, [token]);

    useEffect(() => { load(); }, [load]);

    const isLead = inviteRole === "lead";
    const cleanEmail = email.trim().toLowerCase();
    const emailValid = /^[^\s@]+@[^\s@]+$/.test(cleanEmail) && cleanEmail.endsWith(DOMAIN);

    async function sendInvitation() {
        setSending(true);
        try {
            await createInvitation(token, cleanEmail, isLead ? "lead" : "operator");
            showToast?.("Invitación enviada", `Se envió la invitación a ${cleanEmail}`);
            setEmail("");
            setInviteRole("operator");
            load();
        } catch (err) {
            setError(err.message);
        } finally {
            setSending(false);
        }
    }

    function handleSubmit(e) {
        e.preventDefault();
        setError("");
        if (!emailValid) return setError("Solo puedes invitar correos corporativos");

        if (isLead && confirm) {
            confirm(
                `¿Invitar a ${cleanEmail} como Lead Supervisor? Tendrá acceso al panel de administración: podrá aprobar solicitudes, gestionar turnos e invitar operadores.`,
                sendInvitation,
                "Invitar lead"
            );
            return;
        }
        sendInvitation();
    }

    async function handleRevoke(inv) {
        try {
            await revokeInvitation(token, inv.id);
            showToast?.("Invitación revocada");
            load();
        } catch (err) {
            showToast?.("Error", err.message);
        }
    }

    return (
        <section className="admin-section" style={sectionStyle}>
            <h2 style={{ ...titleStyle, marginBottom: "20px" }}>Invitar</h2>

            <div style={s.grid}>
                {/* Formulario de invitación */}
                <div style={s.card}>
                    <p style={s.cardTitle}>Nueva invitación</p>

                    {isAdmin && (
                        <div style={s.segment} role="tablist">
                            {[
                                { id: "operator", label: "Operador" },
                                { id: "lead", label: "Lead" },
                            ].map((opt) => (
                                <button
                                    key={opt.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={inviteRole === opt.id}
                                    style={{ ...s.segmentBtn, ...(inviteRole === opt.id ? s.segmentBtnActive : {}) }}
                                    onClick={() => { setInviteRole(opt.id); setError(""); }}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} style={s.form}>
                        <input
                            id="invite-email"
                            type="email"
                            className="input-field"
                            placeholder="Correo corporativo"
                            aria-label={`Correo del ${isLead ? "lead" : "operador"}`}
                            value={email}
                            onChange={(e) => { setEmail(e.target.value); setError(""); }}
                            autoComplete="off"
                            required
                        />
                        {error && <p style={s.error}>{error}</p>}
                        <button
                            type="submit"
                            style={{ ...s.submitBtn, ...(sending || !emailValid ? s.submitBtnDisabled : {}) }}
                            disabled={sending || !emailValid}
                        >
                            {sending ? "Enviando…" : isLead ? "Invitar lead" : "Invitar operador"}
                        </button>
                    </form>

                    <p style={s.hint}>
                        {isLead
                            ? "El lead tendrá acceso al panel de administración."
                            : "El enlace llega al correo y expira en 24 horas."}
                    </p>
                </div>

                {/* Invitaciones pendientes */}
                <div style={s.card}>
                    <div style={s.cardHeaderRow}>
                        <p style={s.cardTitle}>Invitaciones pendientes</p>
                        {invitations.length > 0 && <span style={s.countBadge}>{invitations.length}</span>}
                    </div>
                    {invitations.length === 0 && <p style={s.hint}>No hay invitaciones activas</p>}
                    {invitations.length > 0 && (
                        <ul style={s.list}>
                            {invitations.map((inv) => (
                                <li key={inv.id} style={s.listItem}>
                                    <div style={{ minWidth: 0 }}>
                                        <p style={s.listEmail} title={inv.email}>{inv.email}</p>
                                        <p style={s.listMeta}>
                                            <span style={s.badge}>{inv.role === "lead" ? "Lead" : "Operador"}</span>
                                            {formatExpires(inv.expiresAt)}
                                        </p>
                                    </div>
                                    <button type="button" className="user-delete-btn" style={s.revokeBtn} onClick={() => handleRevoke(inv)}>
                                        Revocar
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </section>
    );
}

const s = {
    grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px", alignItems: "start" },
    card: {
        background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "16px",
        padding: "22px 20px", display: "flex", flexDirection: "column", gap: "14px",
        boxShadow: "var(--card-shadow)", overflow: "hidden",
    },
    cardHeaderRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" },
    cardTitle: { margin: 0, fontWeight: "700", fontSize: "1rem", color: "var(--text-main)" },
    hint: { margin: 0, fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.4 },
    countBadge: {
        fontSize: "0.72rem", fontWeight: "700", color: "var(--primary)", background: "var(--primary-light)",
        borderRadius: "999px", padding: "1px 9px", flexShrink: 0,
    },
    segment: { display: "flex", background: "var(--hover-overlay)", borderRadius: "10px", padding: "4px", gap: "4px" },
    segmentBtn: {
        flex: 1, padding: "9px", border: "none", borderRadius: "8px", background: "transparent",
        color: "var(--text-muted)", fontWeight: "600", fontSize: "0.88rem", cursor: "pointer",
        transition: "background 0.2s, color 0.2s",
    },
    segmentBtnActive: { background: "var(--primary)", color: "#fff" },
    form: { display: "flex", flexDirection: "column", gap: "8px" },
    error: {
        margin: 0, fontSize: "0.82rem", color: "var(--text-muted)",
        borderLeft: "3px solid var(--danger)", paddingLeft: "10px",
    },
    submitBtn: {
        marginTop: "4px", width: "100%", padding: "11px", background: "var(--primary)", color: "#fff",
        border: "none", borderRadius: "10px", fontSize: "0.9rem", fontWeight: "700", cursor: "pointer",
        transition: "opacity 0.15s, background 0.2s",
    },
    submitBtnDisabled: { opacity: 0.45, cursor: "not-allowed" },
    list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "8px" },
    listItem: {
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px",
        background: "var(--bg-color)", borderRadius: "10px", padding: "10px 12px",
    },
    listEmail: {
        margin: 0, fontSize: "0.86rem", fontWeight: "600", color: "var(--text-main)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    },
    listMeta: { margin: "3px 0 0", fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px" },
    badge: {
        fontSize: "0.68rem", fontWeight: "700", padding: "1px 7px", borderRadius: "999px",
        background: "var(--primary-light)", color: "var(--primary)",
    },
    revokeBtn: {
        flexShrink: 0, display: "inline-flex", alignItems: "center", gap: "5px",
        background: "#ef4444", color: "#ffffff", border: "1.5px solid #ef4444",
        padding: "5px 10px", borderRadius: "7px", cursor: "pointer", fontSize: "0.75rem", fontWeight: "700", whiteSpace: "nowrap",
    },
};
