import { useEffect, useRef } from "react";
import { io } from "socket.io-client";

export function useSocket(token, eventHandlers) {
    const socketRef = useRef(null);

    useEffect(() => {
        if (!token) return;

        const socket = io(import.meta.env.VITE_API_URL || "/", {
            auth: { token },
            transports: ["websocket", "polling"],
        });

        socketRef.current = socket;

        for (const [event, handler] of Object.entries(eventHandlers)) {
            socket.on(event, handler);
        }

        return () => {
            socket.disconnect();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    return socketRef;
}
