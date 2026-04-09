import { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const storedToken = localStorage.getItem("slc_token");
        const storedUser = localStorage.getItem("slc_user");
        if (storedToken && storedUser) {
            setToken(storedToken);
            setUser(JSON.parse(storedUser));
        }
        setLoading(false);
    }, []);

    const login = (newToken, newUser) => {
        localStorage.setItem("slc_token", newToken);
        localStorage.setItem("slc_user", JSON.stringify(newUser));
        setToken(newToken);
        setUser(newUser);
    };

    const logout = () => {
        localStorage.removeItem("slc_token");
        localStorage.removeItem("slc_user");
        setToken(null);
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, token, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
