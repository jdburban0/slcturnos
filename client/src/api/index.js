const BASE = import.meta.env.VITE_API_URL || "";

function headers(token) {
    return {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
    };
}

async function handle(res) {
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Error del servidor");
    return data;
}

// Auth
export async function login(email, password) {
    return handle(
        await fetch(`${BASE}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        })
    );
}

export async function register(name, email, password, code, group) {
    return handle(
        await fetch(`${BASE}/api/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password, code, group }),
        })
    );
}

export async function getRegisterCode(token) {
    return handle(await fetch(`${BASE}/api/settings/register-code`, { headers: headers(token) }));
}

export async function updateRegisterCode(token, code) {
    return handle(
        await fetch(`${BASE}/api/settings/register-code`, {
            method: "PATCH",
            headers: headers(token),
            body: JSON.stringify({ code }),
        })
    );
}

// Shifts
export async function getShifts(token) {
    return handle(await fetch(`${BASE}/api/shifts`, { headers: headers(token) }));
}

export async function createShift(token, data) {
    return handle(
        await fetch(`${BASE}/api/shifts`, {
            method: "POST",
            headers: headers(token),
            body: JSON.stringify(data),
        })
    );
}

export async function updateShift(token, id, data) {
    return handle(
        await fetch(`${BASE}/api/shifts/${id}`, {
            method: "PATCH",
            headers: headers(token),
            body: JSON.stringify(data),
        })
    );
}

export async function closeWeek(token, weekStart) {
    return handle(
        await fetch(`${BASE}/api/shifts/close-week`, {
            method: "POST",
            headers: headers(token),
            body: JSON.stringify({ weekStart }),
        })
    );
}

export async function deleteShift(token, id) {
    return handle(
        await fetch(`${BASE}/api/shifts/${id}`, {
            method: "DELETE",
            headers: headers(token),
        })
    );
}

export async function assignShift(token, shiftId, name, email) {
    return handle(
        await fetch(`${BASE}/api/shifts/${shiftId}/assign`, {
            method: "POST",
            headers: headers(token),
            body: JSON.stringify({ name, email }),
        })
    );
}

export async function requestShift(token, shiftId) {
    return handle(
        await fetch(`${BASE}/api/shifts/${shiftId}/request`, {
            method: "POST",
            headers: headers(token),
        })
    );
}

// Requests
export async function getRequests(token) {
    return handle(await fetch(`${BASE}/api/requests`, { headers: headers(token) }));
}

export async function reviewRequest(token, requestId, action, notes) {
    return handle(
        await fetch(`${BASE}/api/requests/${requestId}`, {
            method: "PATCH",
            headers: headers(token),
            body: JSON.stringify({ action, notes }),
        })
    );
}

export async function cancelRequest(token, requestId) {
    return handle(
        await fetch(`${BASE}/api/requests/${requestId}`, {
            method: "DELETE",
            headers: headers(token),
        })
    );
}

// Notifications
export async function getNotifications(token) {
    return handle(await fetch(`${BASE}/api/notifications`, { headers: headers(token) }));
}

export async function markNotificationRead(token, id) {
    return handle(
        await fetch(`${BASE}/api/notifications/${id}/read`, {
            method: "PATCH",
            headers: headers(token),
        })
    );
}

export async function markAllNotificationsRead(token) {
    return handle(
        await fetch(`${BASE}/api/notifications/read-all`, {
            method: "PATCH",
            headers: headers(token),
        })
    );
}

// Users
export async function getUsers(token) {
    return handle(await fetch(`${BASE}/api/users`, { headers: headers(token) }));
}

export async function createUser(token, data) {
    return handle(
        await fetch(`${BASE}/api/users`, {
            method: "POST",
            headers: headers(token),
            body: JSON.stringify(data),
        })
    );
}

export async function toggleUser(token, id) {
    return handle(
        await fetch(`${BASE}/api/users/${id}/toggle`, {
            method: "PATCH",
            headers: headers(token),
        })
    );
}

export async function deleteUser(token, id) {
    return handle(
        await fetch(`${BASE}/api/users/${id}`, {
            method: "DELETE",
            headers: headers(token),
        })
    );
}

export async function changePassword(token, currentPassword, newPassword) {
    return handle(
        await fetch(`${BASE}/api/auth/change-password`, {
            method: "PATCH",
            headers: headers(token),
            body: JSON.stringify({ currentPassword, newPassword }),
        })
    );
}

export async function sendScheduleEmail(token, imageBase64, weekLabel, customMessage) {
    return handle(
        await fetch(`${BASE}/api/shifts/send-schedule`, {
            method: "POST",
            headers: headers(token),
            body: JSON.stringify({ imageBase64, weekLabel, customMessage }),
        })
    );
}

