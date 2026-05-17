import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
    const [theme, setTheme] = useState(() => {
        const saved = localStorage.getItem("app-theme");
        if (saved) return saved;
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    });

    useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem("app-theme", theme);

        const dark = theme === "dark";

        // theme-color: controla la barra del navegador en Android/Chrome
        document.querySelectorAll('meta[name="theme-color"]').forEach((el) => {
            el.setAttribute("content", dark ? "#0f172a" : "#ffffff");
        });

        // apple-mobile-web-app-status-bar-style:
        //   default          → barra blanca opaca, iconos oscuros  (modo claro)
        //   black-translucent → transparente, iconos blancos        (modo oscuro, bg oscuro se ve detrás)
        // iOS lee esto al arrancar la app; el cambio mid-session aplica en iOS 16+.
        const statusMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
        if (statusMeta) statusMeta.setAttribute("content", dark ? "black-translucent" : "default");
    }, [theme]);

    const toggleTheme = () => {
        setTheme((prev) => (prev === "dark" ? "light" : "dark"));
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    return useContext(ThemeContext);
}
