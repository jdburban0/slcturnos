self.addEventListener("push", (event) => {
    if (!event.data) return;

    let data = {};
    try { data = event.data.json(); } catch { data = { title: "SLC Turnos", body: event.data.text() }; }

    const title = data.title || "SLC Turnos";
    const options = {
        body: data.body || "",
        icon: "/slcicon.png",
        badge: "/slcicon.png",
        vibrate: [200, 100, 200],
        data: { url: "/" },
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
            for (const client of list) {
                if (client.url.includes(self.location.origin) && "focus" in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) return clients.openWindow("/");
        })
    );
});
