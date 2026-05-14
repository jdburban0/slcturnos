import { useState, useEffect, useRef, useCallback } from "react";
import { getChatContacts, getChatMessages, sendChatMessage, markChatRead, deleteChatMessage, deleteChatConversation } from "../api/index.js";

const ROLE_LABEL = { admin: "Admin", lead: "Lead", operator: "Operador" };
const ROLE_COLOR = {
    admin:    { bg: "#dbeafe", color: "#1d4ed8" },
    lead:     { bg: "#ede9fe", color: "#6d28d9" },
    operator: { bg: "#dcfce7", color: "#15803d" },
};

const AVATAR_COLORS = [
    "#2563eb","#7c3aed","#db2777","#059669","#d97706",
    "#dc2626","#0891b2","#65a30d","#9333ea","#ea580c",
];
function avatarColor(name) {
    const code = (name || "?").charCodeAt(0);
    return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

// ── Íconos reutilizables ──────────────────────────────────────────────────────
const IconTrash = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
        <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
    </svg>
);
const IconCopy = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
);
const IconDots = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none">
        <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
    </svg>
);

// ── Context Menu ──────────────────────────────────────────────────────────────
function ContextMenu({ menu, onClose, onAction }) {
    if (!menu) return null;
    const menuW = 200;
    const menuH = menu.options.length * 46 + 16;
    const left = Math.min(menu.x, window.innerWidth - menuW - 12);
    const top = Math.min(menu.y, window.innerHeight - menuH - 12);
    return (
        <>
            <div style={{ position: "fixed", inset: 0, zIndex: 400 }}
                onClick={onClose}
                onContextMenu={(e) => { e.preventDefault(); onClose(); }}
            />
            <div style={{
                position: "fixed", left, top, zIndex: 401,
                background: "var(--card-bg)",
                border: "1px solid var(--card-border)",
                borderRadius: "12px",
                boxShadow: "0 8px 32px rgba(0,0,0,0.20)",
                overflow: "hidden", minWidth: `${menuW}px`,
                animation: "chatContactIn 0.14s ease",
            }}>
                {menu.options.map((opt, i) => (
                    <button key={i}
                        onClick={() => { onAction(opt.action); onClose(); }}
                        style={{
                            display: "flex", alignItems: "center", gap: "10px",
                            width: "100%", padding: "12px 16px",
                            background: "none", border: "none",
                            borderTop: i > 0 ? "1px solid var(--border-color)" : "none",
                            color: opt.danger ? "#ef4444" : "var(--text-main)",
                            fontSize: "0.875rem", cursor: "pointer",
                            textAlign: "left", fontWeight: "600",
                        }}
                    >
                        {opt.icon}
                        {opt.label}
                    </button>
                ))}
            </div>
        </>
    );
}

// ── Principal ─────────────────────────────────────────────────────────────────
export default function ChatPanel({ token, user, onClose, onUnreadChange, incomingMessage, deletedMessageEvent }) {
    const isAdmin = ["admin", "lead"].includes(user?.role);

    const [contacts, setContacts] = useState([]);
    const [search, setSearch] = useState("");
    const [selectedId, setSelectedId] = useState(null);
    const selectedIdRef = useRef(null);
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState("");
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState("");
    const [loading, setLoading] = useState(false);
    const [ctxMenu, setCtxMenu] = useState(null);
    const bottomRef = useRef(null);
    const inputRef = useRef(null);
    const searchRef = useRef(null);

    useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

    const loadContacts = useCallback(async () => {
        try {
            const data = await getChatContacts(token);
            setContacts(data);
            const total = data.reduce((s, c) => s + c.unread, 0);
            onUnreadChange?.(total);
        } catch {}
    }, [token, onUnreadChange]);

    useEffect(() => {
        loadContacts();
        setTimeout(() => searchRef.current?.focus(), 120);
    }, [loadContacts]);

    async function selectContact(contactId) {
        setSelectedId(contactId);
        setMessages([]);
        setLoading(true);
        setSendError("");
        try {
            const data = await getChatMessages(token, contactId);
            setMessages(data);
            await markChatRead(token, contactId);
            setContacts((prev) => prev.map((c) =>
                c.contact.id === contactId ? { ...c, unread: 0 } : c
            ));
            const remaining = contacts.reduce((s, c) => s + (c.contact.id === contactId ? 0 : c.unread), 0);
            onUnreadChange?.(remaining);
        } catch {}
        finally { setLoading(false); setTimeout(() => inputRef.current?.focus(), 100); }
    }

    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

    // Mensaje entrante del padre (socket)
    useEffect(() => {
        if (!incomingMessage) return;
        const msg = incomingMessage;
        const otherId = msg.senderId === user.id ? msg.recipientId : msg.senderId;
        if (selectedIdRef.current === otherId) {
            setMessages((prev) => [...prev, msg]);
            markChatRead(token, otherId).catch(() => {});
        } else {
            setContacts((prev) => {
                const exists = prev.find((c) => c.contact.id === otherId);
                if (exists) {
                    return prev.map((c) =>
                        c.contact.id === otherId
                            ? { ...c, unread: c.unread + 1, lastMsg: { content: msg.content, createdAt: msg.createdAt, senderId: msg.senderId } }
                            : c
                    );
                }
                loadContacts();
                return prev;
            });
            onUnreadChange?.((n) => n + 1);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [incomingMessage]);

    // Mensaje eliminado por el otro usuario (socket via padre)
    useEffect(() => {
        if (!deletedMessageEvent) return;
        const { messageId, deletedForAll } = deletedMessageEvent;
        if (deletedForAll) {
            // Mostrar placeholder "Mensaje eliminado"
            setMessages((prev) => prev.map((m) =>
                m.id === messageId ? { ...m, deletedForAll: true, content: "" } : m
            ));
        } else {
            setMessages((prev) => prev.filter((m) => m.id !== messageId));
        }
        loadContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deletedMessageEvent]);

    async function handleSend(e) {
        e.preventDefault();
        if (!text.trim() || sending || !selectedId) return;
        setSendError("");
        setSending(true);
        try {
            const msg = await sendChatMessage(token, text.trim(), selectedId);
            setMessages((prev) => [...prev, msg]);
            setText("");
            setContacts((prev) => prev.map((c) =>
                c.contact.id === selectedId
                    ? { ...c, lastMsg: { content: msg.content, createdAt: msg.createdAt, senderId: msg.senderId } }
                    : c
            ));
        } catch (err) { setSendError(err.message || "Error al enviar"); }
        finally { setSending(false); }
    }

    function openCtxMenu(e, options) {
        let x, y;
        if (e.touches?.[0]) { x = e.touches[0].clientX; y = e.touches[0].clientY; }
        else { x = e.clientX ?? 0; y = e.clientY ?? 0; }
        setCtxMenu({ x, y, options });
    }

    async function handleCtxAction(action) {
        if (action.type === "deleteMessage") {
            try {
                await deleteChatMessage(token, action.msgId, action.scope);
                if (action.scope === "all") {
                    // Reemplazar con placeholder visible para ambos
                    setMessages((prev) => prev.map((m) =>
                        m.id === action.msgId ? { ...m, deletedForAll: true, content: "" } : m
                    ));
                } else {
                    // Solo quitar de mi vista
                    setMessages((prev) => prev.filter((m) => m.id !== action.msgId));
                }
                loadContacts();
            } catch {}
        } else if (action.type === "deleteConversation") {
            try {
                await deleteChatConversation(token, action.contactId);
                setContacts((prev) => prev.map((c) =>
                    c.contact.id === action.contactId ? { ...c, lastMsg: null, unread: 0 } : c
                ));
                if (selectedIdRef.current === action.contactId) {
                    setSelectedId(null);
                    setMessages([]);
                }
            } catch {}
        } else if (action.type === "copyMessage") {
            navigator.clipboard?.writeText(action.content).catch(() => {});
        }
    }

    function timeLabel(iso) {
        const d = new Date(iso);
        const today = new Date();
        const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
        if (d.toDateString() === today.toDateString())
            return d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
        if (d.toDateString() === yesterday.toDateString()) return "Ayer";
        return d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
    }

    function fullTimeLabel(iso) {
        return new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
    }

    function groupMessagesByDate(msgs) {
        const groups = [];
        let currentDate = null;
        for (const msg of msgs) {
            const d = new Date(msg.createdAt).toDateString();
            if (d !== currentDate) { currentDate = d; groups.push({ type: "date", label: formatDateLabel(msg.createdAt) }); }
            groups.push({ type: "msg", msg });
        }
        return groups;
    }

    function formatDateLabel(iso) {
        const d = new Date(iso);
        const today = new Date();
        const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
        if (d.toDateString() === today.toDateString()) return "Hoy";
        if (d.toDateString() === yesterday.toDateString()) return "Ayer";
        return d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
    }

    const selectedContact = contacts.find((c) => c.contact.id === selectedId)?.contact;
    const filtered = contacts.filter((c) => c.contact.name.toLowerCase().includes(search.toLowerCase()));
    const withMessages = filtered.filter((c) => c.lastMsg);
    const withoutMessages = filtered.filter((c) => !c.lastMsg);

    const contactMenuOptions = (contactId) => [
        { label: "Eliminar conversación", icon: <IconTrash />, action: { type: "deleteConversation", contactId }, danger: true },
    ];

    const messageMenuOptions = (msgId, content, isMine) => [
        { label: "Copiar texto", icon: <IconCopy />, action: { type: "copyMessage", content }, danger: false },
        { label: "Eliminar para mí", icon: <IconTrash />, action: { type: "deleteMessage", msgId, scope: "me" }, danger: false },
        ...(isMine ? [{ label: "Eliminar para todos", icon: <IconTrash />, action: { type: "deleteMessage", msgId, scope: "all" }, danger: true }] : []),
    ];

    return (
        <div style={s.overlay} onClick={onClose}>
            <div style={s.panel} onClick={(e) => e.stopPropagation()}>
                <ContextMenu menu={ctxMenu} onClose={() => setCtxMenu(null)} onAction={handleCtxAction} />

                {/* ── Header ── */}
                <div style={s.header}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        {selectedId && (
                            <button style={s.backBtn} onClick={() => { setSelectedId(null); setMessages([]); setSendError(""); }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="15 18 9 12 15 6"/>
                                </svg>
                            </button>
                        )}
                        <div style={s.headerIcon}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                            </svg>
                        </div>
                        <div>
                            <p style={s.headerTitle}>{selectedContact ? selectedContact.name : "Mensajes"}</p>
                            {selectedContact && (
                                <span style={{ ...s.roleBadge, ...ROLE_COLOR[selectedContact.role] }}>
                                    {ROLE_LABEL[selectedContact.role]}
                                </span>
                            )}
                            {!selectedId && (
                                <p style={s.headerSub}>{isAdmin ? "Escribe a un operador" : "Escribe al equipo"}</p>
                            )}
                        </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        {selectedId && (
                            <button
                                style={{ ...s.closeBtn, color: "#ef4444" }}
                                title="Eliminar conversación"
                                onClick={() => handleCtxAction({ type: "deleteConversation", contactId: selectedId })}
                            >
                                <IconTrash />
                            </button>
                        )}
                        <button style={s.closeBtn} onClick={onClose} title="Cerrar">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                    </div>
                </div>

                {/* ── Lista de contactos ── */}
                {!selectedId ? (
                    <>
                        <div style={s.searchBar}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-muted)", flexShrink: 0 }}>
                                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                            </svg>
                            <input
                                ref={searchRef}
                                style={s.searchInput}
                                placeholder="Buscar..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                autoComplete="off"
                            />
                            {search && (
                                <button style={s.searchClear} onClick={() => setSearch("")}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                    </svg>
                                </button>
                            )}
                        </div>

                        <div style={s.contactList}>
                            {filtered.length === 0 && (
                                <div style={s.empty}>
                                    <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)" }}>
                                        {search ? "Sin resultados." : "No hay contactos disponibles."}
                                    </p>
                                </div>
                            )}

                            {withMessages.length > 0 && (
                                <>
                                    <div style={s.sectionLabel}>Recientes</div>
                                    {withMessages.map(({ contact, unread, lastMsg }, i) => (
                                        <ContactRow key={contact.id} contact={contact} unread={unread} lastMsg={lastMsg}
                                            userId={user.id} timeLabel={timeLabel} onSelect={selectContact} index={i}
                                            onLongPress={(e) => openCtxMenu(e, contactMenuOptions(contact.id))}
                                        />
                                    ))}
                                </>
                            )}

                            {withoutMessages.length > 0 && (
                                <>
                                    <div style={s.sectionLabel}>
                                        {withMessages.length > 0 ? "Otros contactos" : (isAdmin ? "Operadores" : "Equipo")}
                                    </div>
                                    {withoutMessages.map(({ contact, unread, lastMsg }, i) => (
                                        <ContactRow key={contact.id} contact={contact} unread={unread} lastMsg={lastMsg}
                                            userId={user.id} timeLabel={timeLabel} onSelect={selectContact}
                                            index={withMessages.length + i}
                                            onLongPress={null}
                                        />
                                    ))}
                                </>
                            )}
                        </div>
                    </>
                ) : (
                    /* ── Hilo de mensajes ── */
                    <>
                        <div style={s.messages}>
                            {loading && <p style={s.loadingMsg}>Cargando...</p>}
                            {!loading && messages.length === 0 && (
                                <div style={s.empty}>
                                    <div style={s.emptyIcon}>
                                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                                        </svg>
                                    </div>
                                    <p style={{ margin: "8px 0 0", fontSize: "0.88rem", color: "var(--text-muted)", textAlign: "center" }}>
                                        Inicia la conversación con {selectedContact?.name}.
                                    </p>
                                </div>
                            )}

                            {groupMessagesByDate(messages).map((item, i) =>
                                item.type === "date" ? (
                                    <div key={`date-${i}`} style={s.dateSeparator}>
                                        <span style={s.dateSeparatorText}>{item.label}</span>
                                    </div>
                                ) : (
                                    <MessageBubble
                                        key={item.msg.id}
                                        msg={item.msg}
                                        isMine={item.msg.senderId === user.id}
                                        timeLabel={fullTimeLabel}
                                        onLongPress={(e) => openCtxMenu(e, messageMenuOptions(item.msg.id, item.msg.content, item.msg.senderId === user.id))}
                                    />
                                )
                            )}
                            <div ref={bottomRef} />
                        </div>

                        {sendError && <div style={s.sendErrorBar}>{sendError}</div>}

                        <form style={s.inputRow} onSubmit={handleSend}>
                            <input
                                ref={inputRef}
                                style={s.input}
                                placeholder={`Mensaje para ${selectedContact?.name || ""}...`}
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                autoComplete="off"
                            />
                            <button
                                style={{ ...s.sendBtn, ...((!text.trim() || sending) ? s.sendBtnDisabled : {}) }}
                                type="submit" disabled={!text.trim() || sending}
                                title="Enviar"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                                </svg>
                            </button>
                        </form>
                    </>
                )}
            </div>
        </div>
    );
}

// ── ContactRow ────────────────────────────────────────────────────────────────
function ContactRow({ contact, unread, lastMsg, userId, timeLabel, onSelect, onLongPress, index }) {
    const rc = ROLE_COLOR[contact.role];
    const ac = avatarColor(contact.name);
    const [hovered, setHovered] = useState(false);
    const lpFired = useRef(false);
    const lpTimer = useRef(null);

    function startLongPress(e) {
        if (!onLongPress) return;
        lpFired.current = false;
        const x = e.touches[0]?.clientX ?? 0;
        const y = e.touches[0]?.clientY ?? 0;
        lpTimer.current = setTimeout(() => {
            lpFired.current = true;
            onLongPress({ clientX: x, clientY: y });
        }, 500);
    }

    function cancelLongPress() {
        clearTimeout(lpTimer.current);
    }

    function handleClick() {
        if (lpFired.current) { lpFired.current = false; return; }
        onSelect(contact.id);
    }

    return (
        <button
            className={`chat-contact${unread > 0 ? " has-unread" : ""}`}
            style={{ ...s.contactItem, ...(unread > 0 ? s.contactItemUnread : {}), animationDelay: `${index * 0.04}s` }}
            onClick={handleClick}
            onTouchStart={startLongPress}
            onTouchEnd={cancelLongPress}
            onTouchMove={cancelLongPress}
            onContextMenu={onLongPress ? (e) => { e.preventDefault(); onLongPress(e); } : undefined}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <div style={{ ...s.avatar, background: ac }}>
                {contact.name.charAt(0).toUpperCase()}
            </div>
            <div style={s.contactInfo}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "6px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0, overflow: "hidden" }}>
                        <span style={{ ...s.contactName, ...(unread > 0 ? { fontWeight: "800", color: "var(--text-main)" } : {}), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {contact.name}
                        </span>
                        <span style={{ ...s.roleBadge, ...rc, flexShrink: 0 }}>
                            {ROLE_LABEL[contact.role]}
                        </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                        {!hovered && lastMsg && <span style={s.contactTime}>{timeLabel(lastMsg.createdAt)}</span>}
                        {!hovered && unread > 0 && <span className="chat-unread-badge" style={s.unreadBadge}>{unread}</span>}
                        {hovered && onLongPress && (
                            <span
                                style={s.contactMenuBtn}
                                onClick={(e) => { e.stopPropagation(); onLongPress(e); }}
                                title="Opciones"
                            >
                                <IconDots />
                            </span>
                        )}
                    </div>
                </div>
                <span style={{ ...s.contactPreview, ...(unread > 0 ? { color: "var(--text-main)", fontWeight: "600" } : {}) }}>
                    {lastMsg
                        ? lastMsg.deletedForAll
                            ? <em style={{ opacity: 0.6 }}>Mensaje eliminado</em>
                            : (lastMsg.senderId === userId ? "Tú: " : "") + lastMsg.content
                        : <em style={{ opacity: 0.6 }}>Iniciar conversación</em>
                    }
                </span>
            </div>
        </button>
    );
}

// ── MessageBubble ─────────────────────────────────────────────────────────────
function MessageBubble({ msg, isMine, timeLabel, onLongPress }) {
    const [hovered, setHovered] = useState(false);
    const lpFired = useRef(false);
    const lpTimer = useRef(null);
    const isDeleted = msg.deletedForAll;

    function startLongPress(e) {
        if (isDeleted) return;
        lpFired.current = false;
        const x = e.touches[0]?.clientX ?? 0;
        const y = e.touches[0]?.clientY ?? 0;
        lpTimer.current = setTimeout(() => {
            lpFired.current = true;
            onLongPress({ clientX: x, clientY: y });
        }, 500);
    }

    function cancelLongPress() {
        clearTimeout(lpTimer.current);
    }

    return (
        <div
            style={{ ...s.msgRow, ...(isMine ? s.msgRowMine : {}) }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {!isMine && (
                <div style={{ ...s.msgAvatar, background: ROLE_COLOR[msg.sender?.role]?.color || "var(--border-color)" }}>
                    {msg.sender?.name?.charAt(0).toUpperCase()}
                </div>
            )}
            <div style={{ maxWidth: "72%", display: "flex", flexDirection: "column", alignItems: isMine ? "flex-end" : "flex-start" }}>
                <div
                    style={{
                        ...s.bubble,
                        ...(isDeleted ? s.bubbleDeleted : (isMine ? s.bubbleMine : s.bubbleOther)),
                    }}
                    onTouchStart={startLongPress}
                    onTouchEnd={cancelLongPress}
                    onTouchMove={cancelLongPress}
                    onContextMenu={isDeleted ? undefined : (e) => { e.preventDefault(); onLongPress(e); }}
                >
                    {isDeleted ? (
                        <span style={{ display: "flex", alignItems: "center", gap: "6px", fontStyle: "italic", opacity: 0.75 }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                            </svg>
                            Mensaje eliminado
                        </span>
                    ) : msg.content}
                </div>
                <span style={s.msgTime}>{timeLabel(msg.createdAt)}</span>
            </div>
            {/* Botón de opciones — solo si no está eliminado */}
            {hovered && !isDeleted && (
                <button
                    style={s.msgActionBtn}
                    onClick={(e) => { e.stopPropagation(); onLongPress(e); }}
                    title="Opciones"
                >
                    <IconDots />
                </button>
            )}
        </div>
    );
}

// ── Estilos ───────────────────────────────────────────────────────────────────
const s = {
    overlay: {
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.25)", backdropFilter: "blur(2px)",
    },
    panel: {
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: "min(400px, 100vw)",
        height: "100%", maxHeight: "-webkit-fill-available",
        background: "var(--bg-color)",
        borderLeft: "1px solid var(--card-border)",
        display: "flex", flexDirection: "column",
        boxShadow: "-8px 0 32px rgba(0,0,0,0.15)",
        animation: "slideInRight 0.22s ease",
        overscrollBehavior: "contain",
    },
    header: {
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 18px", borderBottom: "1px solid var(--border-color)",
        background: "var(--card-bg)", flexShrink: 0,
    },
    headerIcon: {
        width: "32px", height: "32px", borderRadius: "8px",
        background: "var(--primary)", color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    },
    headerTitle: { margin: 0, fontWeight: "800", fontSize: "0.95rem", color: "var(--text-main)" },
    headerSub: { margin: 0, fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "1px" },
    roleBadge: {
        display: "inline-block", fontSize: "0.68rem", fontWeight: "700",
        padding: "2px 7px", borderRadius: "999px",
    },
    closeBtn: {
        background: "none", border: "none", cursor: "pointer",
        color: "var(--text-muted)", padding: "6px", borderRadius: "8px",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background 0.15s",
    },
    backBtn: {
        background: "none", border: "none", cursor: "pointer",
        color: "var(--text-muted)", padding: "4px 6px 4px 0", borderRadius: "6px",
        display: "flex", alignItems: "center",
    },
    searchBar: {
        display: "flex", alignItems: "center", gap: "8px",
        padding: "10px 16px", borderBottom: "1px solid var(--border-color)",
        background: "var(--card-bg)", flexShrink: 0,
    },
    searchInput: {
        flex: 1, background: "none", border: "none", outline: "none",
        color: "var(--text-main)", fontSize: "16px",
    },
    searchClear: {
        background: "none", border: "none", cursor: "pointer",
        color: "var(--text-muted)", padding: "2px", display: "flex",
    },
    contactList: { flex: 1, overflowY: "auto" },
    sectionLabel: {
        padding: "10px 18px 6px",
        fontSize: "0.7rem", fontWeight: "800",
        color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em",
        background: "var(--bg-color)", position: "sticky", top: 0, zIndex: 1,
    },
    contactItem: {
        display: "flex", alignItems: "center", gap: "12px",
        width: "100%", padding: "11px 18px",
        background: "none", border: "none", borderBottom: "1px solid var(--border-color)",
        cursor: "pointer", textAlign: "left", transition: "background 0.12s",
    },
    contactItemUnread: { background: "var(--primary-light)" },
    contactMenuBtn: {
        display: "flex", alignItems: "center", justifyContent: "center",
        width: "26px", height: "26px", borderRadius: "50%",
        background: "var(--hover-overlay)", color: "var(--text-muted)",
        cursor: "pointer", flexShrink: 0,
        border: "1px solid var(--border-color)",
    },
    avatar: {
        width: "38px", height: "38px", borderRadius: "50%",
        color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: "800", fontSize: "0.95rem", flexShrink: 0,
    },
    contactInfo: { flex: 1, minWidth: 0 },
    contactName: { fontSize: "0.88rem", fontWeight: "600", color: "var(--text-muted)" },
    contactTime: { fontSize: "0.7rem", color: "var(--text-muted)" },
    contactPreview: {
        display: "block", fontSize: "0.78rem", color: "var(--text-muted)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: "2px",
    },
    unreadBadge: {
        background: "var(--primary)", color: "#fff",
        borderRadius: "999px", fontSize: "0.68rem", fontWeight: "700",
        padding: "1px 6px", minWidth: "18px", textAlign: "center",
    },
    messages: {
        flex: 1, overflowY: "auto", padding: "12px 16px 6px",
        display: "flex", flexDirection: "column", gap: "2px",
    },
    loadingMsg: { color: "var(--text-muted)", textAlign: "center", fontSize: "0.85rem" },
    empty: {
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", padding: "40px 20px",
    },
    emptyIcon: {
        width: "56px", height: "56px", borderRadius: "50%",
        background: "var(--border-color)",
        display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)",
    },
    dateSeparator: { display: "flex", alignItems: "center", gap: "10px", margin: "12px 0 8px" },
    dateSeparatorText: {
        fontSize: "0.7rem", fontWeight: "700", color: "var(--text-muted)",
        textTransform: "capitalize", background: "var(--bg-color)",
        padding: "2px 10px", borderRadius: "999px",
        border: "1px solid var(--border-color)",
        whiteSpace: "nowrap", margin: "0 auto",
    },
    msgRow: { display: "flex", alignItems: "flex-end", gap: "6px", marginBottom: "4px" },
    msgRowMine: { flexDirection: "row-reverse" },
    msgAvatar: {
        width: "26px", height: "26px", borderRadius: "50%", color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "0.7rem", fontWeight: "700", flexShrink: 0,
    },
    msgActionBtn: {
        width: "24px", height: "24px", borderRadius: "50%",
        background: "var(--card-bg)", border: "1px solid var(--card-border)",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", color: "var(--text-muted)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
        flexShrink: 0, alignSelf: "center", padding: 0,
    },
    bubble: {
        padding: "8px 13px", borderRadius: "16px",
        fontSize: "0.875rem", lineHeight: 1.5, wordBreak: "break-word",
    },
    bubbleMine: { background: "var(--primary)", color: "#fff", borderBottomRightRadius: "4px" },
    bubbleOther: {
        background: "var(--card-bg)", color: "var(--text-main)",
        border: "1px solid var(--card-border)", borderBottomLeftRadius: "4px",
    },
    bubbleDeleted: {
        background: "transparent",
        border: "1px dashed var(--border-color)",
        color: "var(--text-muted)",
        borderRadius: "16px",
    },
    msgTime: { fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "3px", paddingLeft: "2px" },
    sendErrorBar: {
        padding: "6px 16px", background: "var(--danger-bg)",
        color: "var(--danger)", fontSize: "0.8rem", flexShrink: 0,
    },
    inputRow: {
        display: "flex", gap: "8px", padding: "10px 14px",
        borderTop: "1px solid var(--border-color)",
        background: "var(--card-bg)", flexShrink: 0,
    },
    input: {
        flex: 1, background: "var(--input-bg)",
        border: "1px solid var(--border-color)", borderRadius: "10px",
        padding: "9px 13px", color: "var(--text-main)",
        fontSize: "16px",
        outline: "none",
    },
    sendBtn: {
        width: "40px", height: "40px", borderRadius: "10px",
        background: "var(--primary)", color: "#fff", border: "none", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, transition: "opacity 0.15s",
    },
    sendBtnDisabled: { opacity: 0.4, cursor: "not-allowed" },
};
