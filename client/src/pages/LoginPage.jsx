import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login, register } from "../api/index.js";
import { useAuth } from "../context/AuthContext.jsx";

function LoginPage() {
    const navigate = useNavigate();
    const { login: saveAuth } = useAuth();
    const [mode, setMode] = useState("login"); // "login" | "register"
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [accessCode, setAccessCode] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [leaving, setLeaving] = useState(false);
    // Clave para re-montar campos al cambiar de modo (activa fadeInDown)
    const [fieldKey, setFieldKey] = useState(0);

    function switchMode(newMode) {
        if (newMode === mode) return;
        setMode(newMode);
        setError("");
        setName("");
        setEmail("");
        setPassword("");
        setConfirmPassword("");
        setAccessCode("");
        setFieldKey((k) => k + 1);
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

        setLoading(true);
        try {
            if (mode === "login") {
                const { token, user } = await login(email, password);
                afterAuth(token, user);
            } else {
                const { token, user } = await register(name, email, password, accessCode);
                afterAuth(token, user);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const isLogin = mode === "login";

    return (
        <div style={styles.page}>
            <div
                className={leaving ? "anim-fade-out" : "anim-fade-in-up"}
                style={styles.card}
            >
                {/* Logo */}
                <div style={styles.logo}>
                    <span style={styles.logoText}>SLC</span>
                    <span style={styles.logoSub}>Turnos</span>
                </div>

                {/* Tabs */}
                <div style={styles.tabs}>
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

                <form style={styles.form} onSubmit={handleSubmit}>
                    {!isLogin && (
                        <div key={`name-${fieldKey}`} className="anim-field" style={styles.field}>
                            <label style={styles.label}>Nombre completo</label>
                            <input
                                type="text"
                                placeholder="Tu nombre"
                                style={styles.input}
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
                            style={styles.input}
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
                            style={styles.input}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    {!isLogin && (
                        <div key={`confirm-${fieldKey}`} className="anim-field" style={{ ...styles.field, animationDelay: "120ms" }}>
                            <label style={styles.label}>Confirmar contraseña</label>
                            <input
                                type="password"
                                placeholder="••••••••"
                                style={styles.input}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                            />
                        </div>
                    )}

                    {!isLogin && (
                        <div key={`code-${fieldKey}`} className="anim-field" style={{ ...styles.field, animationDelay: "160ms" }}>
                            <label style={styles.label}>Código de acceso</label>
                            <input
                                type="text"
                                placeholder="Código proporcionado por el administrador"
                                style={styles.input}
                                value={accessCode}
                                onChange={(e) => setAccessCode(e.target.value)}
                                required
                            />
                        </div>
                    )}

                    {error && (
                        <p key={error} className="anim-shake" style={styles.error}>{error}</p>
                    )}

                    <button type="submit" style={styles.button} disabled={loading}>
                        {loading
                            ? isLogin ? "Ingresando..." : "Creando cuenta..."
                            : isLogin ? "Iniciar sesión" : "Crear cuenta"
                        }
                    </button>
                </form>
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
        background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)",
        padding: "20px",
        fontFamily: "Arial, sans-serif",
    },
    card: {
        width: "100%",
        maxWidth: "420px",
        background: "#ffffff",
        borderRadius: "20px",
        padding: "36px 32px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
    },
    logo: {
        textAlign: "center",
        marginBottom: "24px",
    },
    logoText: {
        fontSize: "2.2rem",
        fontWeight: "900",
        color: "#2563eb",
        letterSpacing: "2px",
    },
    logoSub: {
        fontSize: "1rem",
        fontWeight: "600",
        color: "#64748b",
        marginLeft: "6px",
    },
    tabs: {
        display: "flex",
        borderRadius: "10px",
        background: "#f1f5f9",
        padding: "4px",
        marginBottom: "24px",
        gap: "4px",
    },
    tab: {
        flex: 1,
        padding: "9px",
        border: "none",
        borderRadius: "8px",
        background: "transparent",
        color: "#64748b",
        fontWeight: "600",
        fontSize: "0.88rem",
        cursor: "pointer",
        transition: "background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease",
    },
    tabActive: {
        background: "#ffffff",
        color: "#1e293b",
        boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
    },
    form: {
        display: "flex",
        flexDirection: "column",
        gap: "16px",
    },
    field: {
        display: "flex",
        flexDirection: "column",
        gap: "6px",
    },
    label: {
        fontWeight: "600",
        color: "#1e293b",
        fontSize: "0.9rem",
    },
    input: {
        padding: "12px 14px",
        borderRadius: "10px",
        border: "1.5px solid #cbd5e1",
        fontSize: "1rem",
    },
    error: {
        background: "#fee2e2",
        color: "#991b1b",
        padding: "10px 14px",
        borderRadius: "8px",
        margin: 0,
        fontSize: "0.9rem",
    },
    button: {
        marginTop: "4px",
        padding: "13px",
        border: "none",
        borderRadius: "10px",
        background: "#2563eb",
        color: "#ffffff",
        fontWeight: "bold",
        fontSize: "1rem",
        cursor: "pointer",
    },
};

export default LoginPage;
