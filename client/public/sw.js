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

    event.waitUntil(
        self.registration.showNotification(title, options).then(() => {
            // Update app icon badge with current notification count
            if ("setAppBadge" in self.navigator) {
                return self.registration.getNotifications().then((notifs) => {
                    self.navigator.setAppBadge(notifs.length).catch(() => {});
                });
            }
        })
    );
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();

    // Clear badge when user taps a notification (app will re-sync on load)
    if ("clearAppBadge" in self.navigator) {
        self.navigator.clearAppBadge().catch(() => {});
    }

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
