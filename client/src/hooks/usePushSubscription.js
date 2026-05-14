import { useEffect, useRef } from "react";

// Solo registra el service worker — la suscripción se hace desde PushPrompt
// con un gesto del usuario (requerido por iOS)
export function usePushSubscription(token) {
    const attempted = useRef(false);

    useEffect(() => {
        if (!token || attempted.current) return;
        attempted.current = true;

        if ("serviceWorker" in navigator) {
            navigator.serviceWorker.register("/sw.js").then((reg) => {
                // Cuando hay una nueva versión del SW lista, recargar la app automáticamente
                reg.addEventListener("updatefound", () => {
                    const newWorker = reg.installing;
                    newWorker?.addEventListener("statechange", () => {
                        if (newWorker.state === "activated") {
                            window.location.reload();
                        }
                    });
                });
            }).catch(() => {});
        }
    }, [token]);
}
