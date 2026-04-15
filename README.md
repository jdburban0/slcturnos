# SLC Turnos

Sistema web para la gestión de turnos del equipo operativo de SLC Enterprise. Desarrollado por **Juan David Burbano** como proyecto para la materia **Gestión de la Innovación** de la Universidad Autónoma de Occidente — 2026.

---

## Descripción

SLC Turnos permite a los operadores consultar los turnos disponibles, solicitar cupos y recibir notificaciones sobre el estado de sus solicitudes. Los administradores y supervisores pueden crear turnos, revisar solicitudes, enviar el horario semanal por correo y gestionar los usuarios del equipo.

---

## Tecnologías utilizadas

**Frontend**
- React 18 + Vite
- React Router v6
- Socket.IO client (actualizaciones en tiempo real)

**Backend**
- Node.js + Express
- Prisma ORM
- PostgreSQL (Neon)
- Socket.IO
- JSON Web Tokens (JWT)
- bcryptjs
- Resend (envío de correos)

**Despliegue**
- Frontend: Vercel — [slcturnos.online](https://slcturnos.online)
- Backend: Render
- Base de datos: Neon (PostgreSQL serverless)

---

## Funcionalidades principales

### Operadores
- Registro con código de acceso, nombre, correo @sig.systems y grupo (E1 / E2)
- Inicio de sesión y cierre de sesión
- Ver turnos disponibles por día con filtro de semana
- Solicitar y cancelar turnos
- Ver estado de solicitudes (pendiente / aprobado / rechazado)
- Notificaciones en tiempo real dentro de la app y por correo electrónico
- Cambio de contraseña desde el panel

### Reglas de negocio
- Operadores **E1** no pueden solicitar turnos diurnos los días **lunes** ni **sábado**
- No se puede tener una solicitud activa de turno diurno y nocturno para el mismo día
- No se puede solicitar un turno diurno si hay un turno nocturno aprobado el día anterior
- Al llenarse un turno, las solicitudes pendientes restantes se rechazan automáticamente con el motivo *Turno no disponible*

### Administrador / Supervisor
- Crear turnos individuales o para una semana completa
- Aprobar o rechazar solicitudes con notas opcionales
- Ver y gestionar operadores (activar, banear, eliminar)
- Enviar el horario semanal por correo a todos los operadores con un mensaje personalizado opcional
- Archivar semanas cerradas
- Actualizar el código de acceso para nuevos registros
- Cambio de contraseña desde el panel

---

## Estructura del proyecto

```
slc-turnos/
├── client/          # Aplicación React (frontend)
│   └── src/
│       ├── pages/   # LoginPage, DashboardPage, AdminPage
│       ├── components/
│       ├── context/
│       ├── hooks/
│       └── api/
└── server/          # API REST + WebSockets (backend)
    └── src/
        ├── routes/  # auth, shifts, requests, users, notifications
        ├── lib/     # prisma, mailer
        └── middleware/
```

---

## Variables de entorno

### Backend (`server/.env`)
```
DATABASE_URL=
JWT_SECRET=
CLIENT_URL=
RESEND_API_KEY=
REGISTER_CODE=
```

### Frontend (`client/.env`)
```
VITE_API_URL=
```

---

## Instalación local

```bash
# Instalar dependencias
cd server && npm install
cd ../client && npm install

# Generar cliente Prisma y sincronizar schema
cd ../server && npx prisma generate && npx prisma db push

# Iniciar backend
npm run dev

# Iniciar frontend (en otra terminal)
cd ../client && npm run dev
```

---

## Autor

**Juan David Burbano**  
Universidad Autónoma de Occidente  
Materia: Gestión de la Innovación — 2026  
Proyecto desarrollado para SLC Enterprise
