import { useEffect, useRef } from "react";

// Solo registra el service worker — la suscripción se hace desde PushPrompt
// con un gesto del usuario (requerido por iOS)
export function usePushSubscription(token) {
    const attempted = useRef(false);

    useEffect(() => {
        if (!token || attempted.current) return;
        attempted.current = true;

        if ("serviceWorker" in navigator) {
            navigator.serviceWorker.register("/sw.js").catch(() => {});
        }
    }, [token]);
}
