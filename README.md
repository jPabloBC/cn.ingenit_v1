# SII Contabilidad - Scaffold

Scaffold mínimo para iniciar un proyecto SII-friendly con Next.js y Supabase.

Requisitos:
- Node.js 18+
- Cuenta Supabase (puedes usar free tier)

Archivos relevantes:
- `lib/supabaseAdmin.ts` — cliente server-side con `SUPABASE_SERVICE_ROLE_KEY`.
- `pages/api/generate-folio` — ejemplo de endpoint que llama a `next_folio`.
- `migrations/001_init.sql` — crea `tenants`, `tenant_folio_seq`, `folios` y la función `next_folio`.


Instalación local:

```bash
npm install
cp .env.example .env.local
# Rellenar variables en .env.local
npm run dev
```

Migraciones:

- Ejecuta todas las migraciones con `psql` estableciendo `DATABASE_URL` (ej. `postgres://user:pass@host:5432/db`):

```bash
export DATABASE_URL="postgres://user:pass@host:5432/db"
./scripts/run_migrations.sh
```

- Alternativa: usa la CLI de Supabase para ejecutar archivos SQL si trabajas directamente con un proyecto Supabase.

RLS y Auth:

- `migrations/002_rls.sql` crea la tabla `memberships` y políticas RLS de ejemplo que usan `auth.uid()` y `auth.role()` (funciones de Supabase Auth). Ajusta estas políticas si tu proveedor de auth expone los claims de forma distinta.
 - `migrations/002_rls.sql` crea la tabla `cn_memberships` y políticas RLS de ejemplo que usan `auth.uid()` y `auth.role()` (funciones de Supabase Auth). Todas las tablas del proyecto usan el prefijo `cn_`.

Despliegue en Vercel:

- Configura variables de entorno en el proyecto Vercel: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, y si usas `scripts/run_migrations.sh` configura `DATABASE_URL` en tu runner de CI.


Seguridad:
- Guarda certificados y claves P12 fuera del repo; usa Secret Manager o variables de entorno cifradas.
