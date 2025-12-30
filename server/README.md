Ejemplo de servidor para gestión de sesiones únicas.

Requisitos:
- PostgreSQL con `db/sessions.sql` aplicado.

Variables de entorno:
- `DATABASE_URL` (connection string a Postgres)
- `SUPABASE_URL` (la URL de tu proyecto Supabase, ej. https://xyz.supabase.co)
- `SUPABASE_ANON_KEY` (anon/public key usada para validar tokens en el servidor)
- `PORT` opcional (default 4000)

Instalación y ejecución:

```bash
cd server
npm install
DATABASE_URL="postgres://user:pass@localhost:5432/dbname" npm start
```

Endpoints:
- POST /sessions/acquire { user_id, token?, meta? }
- POST /sessions/heartbeat { session_id }
- POST /sessions/release { session_id }
- GET /sessions/validate?session_id=...
