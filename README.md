# SLC Turnos

Plataforma web para la gestión de turnos del equipo SLC. Permite a los operadores solicitar turnos y a los administradores aprobar, rechazar, asignar y hacer seguimiento en tiempo real.

**URL:** [slcturnos.online](https://slcturnos.online)

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React + Vite |
| Backend | Node.js + Express |
| Base de datos | PostgreSQL + Prisma ORM |
| Tiempo real | Socket.IO |
| Correo | Resend |
| Auth | JWT (8h) |

---

## Roles

| Rol | Descripción |
|-----|-------------|
| `operator` | Solicita turnos, puede desistir o traspasar |
| `lead` | Aprueba solicitudes, gestiona turnos (no puede cambiar ajustes) |
| `admin` | Acceso completo incluyendo ajustes del sistema |

---

## Funcionalidades

### Operadores
- Ver turnos disponibles agrupados por día
- Solicitar, cancelar, desistir o traspasar turnos aprobados
- No pueden traspasar a compañeros ya asignados al mismo turno
- Reciben notificaciones por correo al ser aprobados, rechazados o asignados
- Recuperación de contraseña por código al correo

### Administradores / Leads
- Crear turnos individuales o por semana completa (diurnos y nocturnos)
- Archivar semanas cerradas
- Aprobar o rechazar solicitudes de turno, desistimientos y traspasos
- Asignar operadores manualmente a un turno
- Enviar el horario semanal por correo con mensaje personalizado
- Exportar el horario como JPG o Excel
- Banear / desbanear / eliminar operadores
- Notificación automática a todos los operadores al abrir nuevos cupos

### Solo Admin
- Cambiar el código de acceso de operadores
- Cambiar el código de acceso de administradores

---

## Estructura del proyecto

```
slc-turnos/
├── client/          # React + Vite (frontend)
│   └── src/
│       ├── pages/       # LoginPage, DashboardPage, AdminPage
│       ├── components/  # ShiftCard, ScheduleTable, NotificationBell...
│       ├── context/     # AuthContext, ThemeContext
│       ├── hooks/       # useSocket
│       └── api/         # Funciones fetch al backend
│
└── server/          # Express (backend)
    └── src/
        ├── routes/      # auth, shifts, requests, transfers, users, notifications
        ├── lib/         # prisma.js, mailer.js
        ├── middleware/  # auth.js
        └── index.js
```

---

## Variables de entorno

### Server (`server/.env`)
```
DATABASE_URL=
JWT_SECRET=
RESEND_API_KEY=
```

### Client (`client/.env`)
```
VITE_API_URL=
```

---

## Correr en local

```bash
# Backend
cd server
npm install
npx prisma migrate dev
npm run dev

# Frontend
cd client
npm install
npm run dev
```

---

## Deploy con cambios en base de datos

Si se modifica el schema de Prisma, ejecutar en producción:

```bash
npx prisma migrate deploy
```

Sin este paso el servidor puede crashear al no encontrar las columnas o tablas nuevas.
