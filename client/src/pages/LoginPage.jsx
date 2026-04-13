import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { login, register, forgotPassword, resetPassword } from "../api/index.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";

function LoginPage() {
    const navigate = useNavigate();
    const { login: saveAuth } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const [mode, setMode] = useState("login"); // "login" | "register" | "forgot" | "reset"
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [accessCode, setAccessCode] = useState("");
    const [group, setGroup] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [leaving, setLeaving] = useState(false);
    const [fieldKey, setFieldKey] = useState(0);
    const [formAnim, setFormAnim] = useState("form-enter");
    const [serverReady, setServerReady] = useState(false);
    const [resetEmail, setResetEmail] = useState("");
    const [resetCode, setResetCode] = useState("");
    const [resetPwd, setResetPwd] = useState("");
    const [resetConfirm, setResetConfirm] = useState("");
    const [resetSuccess, setResetSuccess] = useState(false);

    useEffect(() => {
        const base = import.meta.env.VITE_API_URL || "";
        const ping = () => fetch(`${base}/api/ping`)
            .then(() => setServerReady(true))
            .catch(() => setTimeout(ping, 3000));
        ping();
    }, []);

    function switchMode(newMode) {
        if (newMode === mode || formAnim === "form-exit") return;
        setFormAnim("form-exit");
        setTimeout(() => {
            setMode(newMode);
            setError("");
            setName("");
            setEmail("");
            setPassword("");
            setConfirmPassword("");
            setAccessCode("");
            setGroup("");
            setResetCode("");
            setResetPwd("");
            setResetConfirm("");
            setResetSuccess(false);
            setFieldKey((k) => k + 1);
            setFormAnim("form-enter");
        }, 180);
    }

    function afterAuth(token, user) {
        setLeaving(true);
        setTimeout(() => {
            saveAuth(token, user);
            if (user.role === "admin" || user.role === "lead") {
                navigate("/admin");
            } else {
                navigate("/dashboard");
            }
        }, 320);
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");

        if (mode === "register") {
            if (!email.toLowerCase().endsWith("@sig.systems")) {
                return setError("Solo se permiten correos @sig.systems");
            }
            if (password !== confirmPassword) {
                return setError("Las contraseñas no coinciden");
            }
            if (password.length < 6) {
                return setError("La contraseña debe tener al menos 6 caracteres");
            }
        }

        if (mode === "reset") {
            if (!resetCode.trim()) {
                return setError("Ingresa el código recibido por correo");
            }
            if (resetPwd.length < 6) {
                return setError("La contraseña debe tener al menos 6 caracteres");
            }
            if (resetPwd !== resetConfirm) {
                return setError("Las contraseñas no coinciden");
            }
        }

        setLoading(true);
        try {
            if (mode === "login") {
                const { token, user } = await login(email, password);
                afterAuth(token, user);
            } else if (mode === "register") {
                const { token, user } = await register(name, email, password, accessCode, group);
                afterAuth(token, user);
            } else if (mode === "forgot") {
                await forgotPassword(email);
                setResetEmail(email);
                switchMode("reset");
            } else if (mode === "reset") {
                await resetPassword(resetEmail, resetCode, resetPwd);
                setResetSuccess(true);
                setTimeout(() => switchMode("login"), 2000);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const isLogin = mode === "login";
    const isForgot = mode === "forgot";
    const isReset = mode === "reset";

    return (
        <div style={styles.page}>
            {/* Theme Toggle Button */}
            <div style={styles.themeToggleContainer}>
                <button onClick={toggleTheme} className="theme-toggle" title="Alternar tema">
                    {theme === 'dark' ? '☀️' : '🌙'}
                </button>
            </div>

            <div
                className={`glass-container ${leaving ? "anim-fade-out" : "anim-fade-in-up"}`}
                style={styles.card}
            >
                {/* Logo */}
                <div style={styles.logo}>
                    <span style={styles.logoText}>SLC</span>
                    <span style={styles.logoSub}>Turnos</span>
                </div>

                {/* Tabs / Title */}
                {(isForgot || isReset) ? (
                    <div style={styles.resetTitle}>Restablecer contraseña</div>
                ) : (
                    <div style={styles.tabs}>
                        <div style={{ ...styles.tabPill, transform: `translateX(${isLogin ? "0%" : "100%"})` }} />
                        <button
                            style={{ ...styles.tab, ...(isLogin ? styles.tabActive : {}) }}
                            onClick={() => switchMode("login")}
                            type="button"
                        >
                            Iniciar sesión
                        </button>
                        <button
                            style={{ ...styles.tab, ...(!isLogin ? styles.tabActive : {}) }}
                            onClick={() => switchMode("register")}
                            type="button"
                        >
                            Registrarse
                        </button>
                    </div>
                )}

                <div key={fieldKey} className={formAnim}>
                    <form style={styles.form} onSubmit={handleSubmit}>

                        {/* ── forgot mode ── */}
                        {isForgot && (
                            <div key={`forgot-email-${fieldKey}`} className="anim-field" style={styles.field}>
                                <label style={styles.label}>Correo</label>
                                <input
                                    type="email"
                                    placeholder="correo@sig.systems"
                                    className="input-field"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                            </div>
                        )}

                        {/* ── reset mode ── */}
                        {isReset && !resetSuccess && (
                            <>
                                <div key={`reset-code-${fieldKey}`} className="anim-field" style={styles.field}>
                                    <label style={styles.label}>Código</label>
                                    <input
                                        type="text"
                                        placeholder="123456"
                                        className="input-field"
                                        value={resetCode}
                                        onChange={(e) => setResetCode(e.target.value)}
                                        required
                                    />
                                </div>
                                <div key={`reset-pwd-${fieldKey}`} className="anim-field" style={{ ...styles.field, animationDelay: "40ms" }}>
                                    <label style={styles.label}>Nueva contraseña</label>
                                    <input
                                        type="password"
                                        placeholder="••••••••"
                                        className="input-field"
                                        value={resetPwd}
                                        onChange={(e) => setResetPwd(e.target.value)}
                                        required
                                    />
                                </div>
                                <div key={`reset-confirm-${fieldKey}`} className="anim-field" style={{ ...styles.field, animationDelay: "80ms" }}>
                                    <label style={styles.label}>Confirmar contraseña</label>
                                    <input
                                        type="password"
                                        placeholder="••••••••"
                                        className="input-field"
                                        value={resetConfirm}
                                        onChange={(e) => setResetConfirm(e.target.value)}
                                        required
                                    />
                                </div>
                            </>
                        )}

                        {/* ── login / register modes ── */}
                        {!isForgot && !isReset && (
                            <>
                                {!isLogin && (
                                    <div key={`name-${fieldKey}`} className="anim-field" style={styles.field}>
                                        <label style={styles.label}>Nombre completo</label>
                                        <input
                                            type="text"
                                            placeholder="Tu nombre"
                                            className="input-field"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            required
                                        />
                                    </div>
                                )}

                                <div key={`email-${fieldKey}`} className="anim-field" style={{ ...styles.field, animationDelay: isLogin ? "0ms" : "40ms" }}>
                                    <label style={styles.label}>Correo</label>
                                    <input
                                        type="email"
                                        placeholder="correo@sig.systems"
                                        className="input-field"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                    />
                                </div>

                                <div key={`pass-${fieldKey}`} className="anim-field" style={{ ...styles.field, animationDelay: isLogin ? "40ms" : "80ms" }}>
                                    <label style={styles.label}>Contraseña</label>
                                    <input
                                        type="password"
                                        placeholder="••••••••"
                                        className="input-field"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                    />
                                    {isLogin && (
                                        <span
                                            style={styles.forgotLink}
                                            onClick={() => switchMode("forgot")}
                                        >
                                            ¿Olvidaste tu contraseña?
                                        </span>
                                    )}
                                </div>

                                {!isLogin && (
                                    <div key={`confirm-${fieldKey}`} className="anim-field" style={{ ...styles.field, animationDelay: "80ms" }}>
                                        <label style={styles.label}>Confirmar contraseña</label>
                                        <input
                                            type="password"
                                            placeholder="••••••••"
                                            className="input-field"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            required
                                        />
                                    </div>
                                )}

                                {!isLogin && (
                                    <div key={`group-${fieldKey}`} className="anim-field" style={{ ...styles.field, animationDelay: "120ms" }}>
                                        <label style={styles.label}>Grupo <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(solo operadores)</span></label>
                                        <select
                                            className="input-field"
                                            style={{ color: group ? "var(--text-main)" : "var(--text-muted)" }}
                                            value={group}
                                            onChange={(e) => setGroup(e.target.value)}
                                        >
                                            <option value="">Sin grupo</option>
                                            <option value="E1">E1</option>
                                            <option value="E2">E2</option>
                                        </select>
                                    </div>
                                )}

                                {!isLogin && (
                                    <div key={`code-${fieldKey}`} className="anim-field" style={{ ...styles.field, animationDelay: "200ms" }}>
                                        <label style={styles.label}>Código de acceso</label>
                                        <input
                                            type="text"
                                            placeholder="Código proporcionado por el administrador"
                                            className="input-field"
                                            value={accessCode}
                                            onChange={(e) => setAccessCode(e.target.value)}
                                            required
                                        />
                                    </div>
                                )}
                            </>
                        )}

                        {error && (
                            <p key={error} className="anim-shake" style={styles.error}>{error}</p>
                        )}

                        {resetSuccess && (
                            <p style={styles.successMsg}>
                                Contraseña cambiada. Redirigiendo al inicio de sesión…
                            </p>
                        )}

                        {!serverReady && (
                            <div style={styles.serverWaiting}>
                                <span style={styles.dot} />
                                Iniciando servidor…
                            </div>
                        )}

                        {!resetSuccess && (
                            <button
                                type="submit"
                                className="btn btn-primary"
                                style={{ marginTop: "10px", width: "100%", padding: "14px" }}
                                disabled={loading || !serverReady}
                            >
                                {loading
                                    ? isForgot ? "Enviando…" : isReset ? "Cambiando…" : isLogin ? "Ingresando..." : "Creando cuenta..."
                                    : isForgot ? "Enviar código" : isReset ? "Cambiar contraseña" : isLogin ? "Iniciar sesión" : "Crear cuenta"
                                }
                            </button>
                        )}
                    </form>

                    {/* Back links for forgot / reset */}
                    {isForgot && (
                        <p
                            style={styles.backLink}
                            onClick={() => switchMode("login")}
                        >
                            ← Volver al inicio de sesión
                        </p>
                    )}
                    {isReset && (
                        <p
                            style={styles.backLink}
                            onClick={() => switchMode("forgot")}
                        >
                            ← Volver
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

const styles = {
    page: {
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "var(--bg-gradient)",
        padding: "20px",
        position: "relative"
    },
    themeToggleContainer: {
        position: "absolute",
        top: "20px",
        right: "20px",
    },
    card: {
        width: "100%",
        maxWidth: "420px",
        padding: "40px 32px",
    },
    logo: {
        textAlign: "center",
        marginBottom: "28px",
    },
    logoText: {
        fontSize: "2.5rem",
        fontWeight: "900",
        color: "var(--primary)",
        letterSpacing: "1px",
    },
    logoSub: {
        fontSize: "1.1rem",
        fontWeight: "600",
        color: "var(--text-muted)",
        marginLeft: "6px",
    },
    tabs: {
        display: "flex",
        position: "relative",
        borderRadius: "12px",
        background: "var(--hover-overlay)",
        padding: "5px",
        marginBottom: "28px",
        gap: "0",
    },
    tabPill: {
        position: "absolute",
        top: "5px",
        left: "5px",
        width: "calc(50% - 5px)",
        height: "calc(100% - 10px)",
        background: "var(--card-bg)",
        borderRadius: "8px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
        transition: "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
        pointerEvents: "none",
        border: "1px solid var(--card-border)"
    },
    tab: {
        flex: 1,
        padding: "10px",
        border: "none",
        borderRadius: "8px",
        background: "transparent",
        color: "var(--text-muted)",
        fontWeight: "600",
        fontSize: "0.9rem",
        cursor: "pointer",
        position: "relative",
        zIndex: 1,
        transition: "color 0.2s ease",
    },
    tabActive: {
        color: "var(--text-main)",
    },
    form: {
        display: "flex",
        flexDirection: "column",
        gap: "18px",
    },
    field: {
        display: "flex",
        flexDirection: "column",
        gap: "6px",
    },
    label: {
        fontWeight: "600",
        color: "var(--text-main)",
        fontSize: "0.9rem",
    },
    error: {
        background: "var(--danger-bg)",
        color: "var(--danger)",
        padding: "12px 14px",
        borderRadius: "10px",
        margin: 0,
        fontSize: "0.9rem",
        border: "1px solid rgba(220, 38, 38, 0.2)"
    },
    serverWaiting: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        fontSize: "0.85rem",
        color: "var(--text-muted)",
        justifyContent: "center",
    },
    dot: {
        display: "inline-block",
        width: "8px",
        height: "8px",
        borderRadius: "50%",
        background: "var(--warning)",
        animation: "pulse 1.2s ease-in-out infinite",
    },
};

export default LoginPage;
