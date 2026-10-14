import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { verifyInvitation, register } from "../api/index.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";

const PASSWORD_RULES = [
    { id: "len", label: "Mínimo 8 caracteres", test: (p) => p.length >= 8 },
    { id: "upper", label: "Al menos una mayúscula", test: (p) => /[A-Z]/.test(p) },
    { id: "number", label: "Al menos un número", test: (p) => /\d/.test(p) },
];

const EyeIcon = ({ open }) => open ? (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
) : (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
);

function RegisterPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const inviteToken = searchParams.get("token") || "";
    const { login: saveAuth } = useAuth();
    const { theme, toggleTheme } = useTheme();

    const [status, setStatus] = useState("checking"); // "checking" | "valid" | "invalid"
    const [invalidMsg, setInvalidMsg] = useState("");
    const [invite, setInvite] = useState(null); // { email, role }

    const [name, setName] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [group, setGroup] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [leaving, setLeaving] = useState(false);

    useEffect(() => {
        if (!inviteToken) {
            setInvalidMsg("Para registrarte necesitas una invitación. Pídela a tu supervisor.");
            setStatus("invalid");
            return;
        }
        verifyInvitation(inviteToken)
            .then((data) => { setInvite(data); setStatus("valid"); })
            .catch((err) => { setInvalidMsg(err.message); setStatus("invalid"); });
    }, [inviteToken]);

    const isLead = invite?.role === "lead";
    const rulesOk = PASSWORD_RULES.every((r) => r.test(password));

    async function handleSubmit(e) {
        e.preventDefault();
        setError("");
        if (!name.trim()) return setError("Ingresa tu nombre completo");
        if (!rulesOk) return setError("La contraseña debe tener al menos 8 caracteres, una mayúscula y un número");
        if (password !== confirm) return setError("Las contraseñas no coinciden");
        if (!isLead && !group) return setError("Selecciona tu grupo (E1 o E2)");

        setLoading(true);
        try {
            const { token, user } = await register({
                token: inviteToken,
                name: name.trim(),
                email: invite.email,
                password,
                group: isLead ? undefined : group,
            });
            setLeaving(true);
            setTimeout(() => {
                saveAuth(token, user);
                navigate(user.role === "operator" ? "/dashboard" : "/admin", { replace: true });
            }, 320);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div style={styles.page}>
            <div style={styles.themeToggleContainer}>
                <button onClick={toggleTheme} className="theme-toggle icon-btn" title="Alternar tema">
                    {theme === "dark" ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                            <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                        </svg>
                    ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                        </svg>
                    )}
                </button>
            </div>

            <div className={`glass-container ${leaving ? "anim-fade-out" : "anim-fade-in-up"}`} style={styles.card}>
                <div style={styles.logo}>
                    <span style={styles.logoText}>SLC</span>
                    <span style={styles.logoSub}>Turnos</span>
                </div>

                {status === "checking" && <p style={styles.muted}>Verificando invitación…</p>}

                {status === "invalid" && (
                    <div style={styles.invalidBox}>
                        <p style={styles.title}>Invitación no disponible</p>
                        <p style={styles.muted}>{invalidMsg}</p>
                        <Link to="/login" style={styles.backLink}>Ir al inicio de sesión</Link>
                    </div>
                )}

                {status === "valid" && invite && (
                    <>
                        <div style={styles.title}>Crear cuenta</div>
                        <div style={styles.roleRow}>
                            <span style={{ ...styles.roleBadge, ...(isLead ? styles.roleBadgeLead : {}) }}>
                                {isLead ? "Lead Supervisor" : "Operador"}
                            </span>
                        </div>

                        <form style={styles.form} onSubmit={handleSubmit}>
                            <div style={styles.field}>
                                <label style={styles.label} htmlFor="reg-name">Nombre completo</label>
                                <input id="reg-name" type="text" className="input-field" placeholder="Tu nombre"
                                    value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
                            </div>

                            <div style={styles.field}>
                                <label style={styles.label} htmlFor="reg-email">Correo</label>
                                <input id="reg-email" type="email" className="input-field" value={invite.email}
                                    readOnly autoComplete="username" style={styles.readOnly} />
                                <span style={styles.hint}>Es el correo al que llegó la invitación.</span>
                            </div>

                            <div style={styles.field}>
                                <label style={styles.label} htmlFor="reg-pwd">Contraseña</label>
                                <div style={styles.pwdWrapper}>
                                    <input id="reg-pwd" type={showPassword ? "text" : "password"} className="input-field"
                                        placeholder="••••••••" style={{ paddingRight: "42px" }}
                                        value={password} onChange={(e) => setPassword(e.target.value)}
                                        autoComplete="new-password" required />
                                    <button type="button" style={styles.eyeBtn} onClick={() => setShowPassword((v) => !v)} tabIndex={-1}>
                                        <EyeIcon open={showPassword} />
                                    </button>
                                </div>
                                <ul style={styles.rules}>
                                    {PASSWORD_RULES.map((r) => {
                                        const ok = r.test(password);
                                        return (
                                            <li key={r.id} style={{ ...styles.rule, color: ok ? "var(--success, #16a34a)" : "var(--text-muted)" }}>
                                                <span style={styles.ruleIcon}>{ok ? "✓" : "•"}</span>{r.label}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>

                            <div style={styles.field}>
                                <label style={styles.label} htmlFor="reg-confirm">Confirmar contraseña</label>
                                <input id="reg-confirm" type={showPassword ? "text" : "password"} className="input-field"
                                    placeholder="••••••••" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                                    autoComplete="new-password" required />
                                {confirm && confirm !== password && <span style={styles.hintError}>Las contraseñas no coinciden</span>}
                            </div>

                            {!isLead && (
                                <div style={styles.field}>
                                    <label style={styles.label}>Grupo</label>
                                    <div style={styles.groupRow}>
                                        {["E1", "E2"].map((g) => (
                                            <button key={g} type="button"
                                                style={{ ...styles.groupBtn, ...(group === g ? styles.groupBtnActive : {}) }}
                                                onClick={() => setGroup(g)} aria-pressed={group === g}>
                                                {g}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {error && <p key={error} className="anim-shake" style={styles.error}>{error}</p>}

                            <button type="submit" className="btn btn-primary"
                                style={{ marginTop: "6px", width: "100%", padding: "14px" }} disabled={loading}>
                                {loading ? "Creando cuenta…" : "Crear cuenta"}
                            </button>
                        </form>
                    </>
                )}
            </div>
        </div>
    );
}

const styles = {
    page: { minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center", background: "var(--bg-gradient)", padding: "20px", position: "relative" },
    themeToggleContainer: { position: "absolute", top: "20px", right: "20px" },
    card: { width: "100%", maxWidth: "420px", padding: "40px 32px" },
    logo: { textAlign: "center", marginBottom: "24px" },
    logoText: { fontSize: "2.5rem", fontWeight: "900", color: "var(--primary)", letterSpacing: "1px" },
    logoSub: { fontSize: "1.1rem", fontWeight: "600", color: "var(--text-muted)", marginLeft: "6px" },
    title: { textAlign: "center", fontWeight: "700", fontSize: "1.1rem", color: "var(--text-main)", marginBottom: "10px" },
    roleRow: { display: "flex", justifyContent: "center", marginBottom: "22px" },
    roleBadge: { fontSize: "0.75rem", fontWeight: "700", padding: "4px 12px", borderRadius: "999px", background: "var(--primary-light)", color: "var(--primary)" },
    roleBadgeLead: { background: "var(--primary-light)", color: "var(--primary)" },
    form: { display: "flex", flexDirection: "column", gap: "16px" },
    field: { display: "flex", flexDirection: "column", gap: "6px" },
    label: { fontWeight: "600", color: "var(--text-main)", fontSize: "0.9rem" },
    readOnly: { opacity: 0.75, cursor: "not-allowed" },
    hint: { fontSize: "0.76rem", color: "var(--text-muted)" },
    hintError: { fontSize: "0.76rem", color: "var(--danger)" },
    pwdWrapper: { position: "relative", display: "flex", alignItems: "center" },
    eyeBtn: { position: "absolute", right: "12px", background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1, color: "var(--text-muted)", display: "flex", alignItems: "center" },
    rules: { listStyle: "none", margin: "2px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "2px" },
    rule: { fontSize: "0.78rem", display: "flex", alignItems: "center", gap: "6px", transition: "color 0.2s" },
    ruleIcon: { width: "12px", display: "inline-block", textAlign: "center", fontWeight: "700" },
    groupRow: { display: "flex", gap: "10px" },
    groupBtn: {
        flex: 1, padding: "12px", borderRadius: "10px", border: "1.5px solid var(--border-color, var(--card-border))",
        background: "var(--input-bg, transparent)", color: "var(--text-main)", fontWeight: "700", fontSize: "0.95rem", cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s, color 0.15s",
    },
    groupBtnActive: { background: "var(--primary)", borderColor: "var(--primary)", color: "#fff" },
    error: { color: "var(--text-muted)", margin: 0, fontSize: "0.83rem", borderLeft: "3px solid var(--danger)", paddingLeft: "10px", textAlign: "left" },
    muted: { textAlign: "center", color: "var(--text-muted)", fontSize: "0.9rem", lineHeight: 1.5, margin: "0 0 12px" },
    invalidBox: { textAlign: "center" },
    backLink: { display: "inline-block", marginTop: "8px", fontSize: "0.88rem", color: "var(--primary)", fontWeight: "600", textDecoration: "none" },
};

export default RegisterPage;
