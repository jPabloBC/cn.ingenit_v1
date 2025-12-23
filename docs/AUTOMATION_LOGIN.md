# Automatización con Login Interactivo

Este sistema permite visualizar sitios web protegidos con autenticación dentro de la aplicación.

## Características

- ✅ Proxy server-side para evitar CORS
- ✅ Renderizado con Playwright (HTML o screenshot)
- ✅ Login automático heurístico (formularios simples)
- ✅ Login interactivo para CAPTCHA/MFA/client-cert
- ✅ Persistencia de sesión (cookies guardadas)
- ✅ Fallback a screenshot cuando X-Frame-Options impide embebido

## Instalación

```bash
npm install
npm install playwright minimist
npx playwright install
```

## Uso

### 1. Login Automático (UI)

Para sitios con login simple (usuario/contraseña sin CAPTCHA):

1. Ve a la página **Automatización** en el dashboard
2. Ingresa la URL del sitio (ej: `https://homer.sii.cl/`)
3. Click en **🔐 Login**
4. Ingresa usuario y contraseña
5. Click en **Login**
6. Si tiene éxito, verás **✓ Sesión** y las cookies se guardan automáticamente
7. Marca **Mostrar en página** para ver el contenido autenticado

### 2. Login Interactivo (Script Local)

Para sitios con CAPTCHA, MFA, o certificados de cliente:

#### Paso 1: Obtener tu User ID
```bash
# En la consola del navegador (después de loguearte en la app):
localStorage.getItem('cn_access_token')
# Decodifica el JWT para obtener tu user_id, o usa:
# JSON.parse(atob(localStorage.getItem('cn_access_token').split('.')[1])).sub
```

#### Paso 2: Ejecutar el script headed
```bash
node scripts/playwright_headed_login.js \
  --url https://homer.sii.cl/ \
  --user-id TU_USER_ID
```

Esto abrirá un navegador visible:
- Completa el login manualmente (CAPTCHA, MFA, etc.)
- Una vez autenticado, regresa al terminal y presiona **ENTER**
- Las cookies se guardarán en `data/playwright_sessions/{user_id}.json`

#### Paso 3: Usar la sesión guardada
- Ve a la UI **Automatización**
- Marca **Mostrar en página** y navega a cualquier URL del mismo dominio
- El servidor cargará las cookies guardadas y mostrará la página autenticada

### 3. Gestión de Sesión

- **Ver estado**: el botón mostrará **✓ Sesión** si hay cookies guardadas
- **Cerrar sesión**: click en **Cerrar sesión** para eliminar las cookies guardadas
- **Revalidar**: si la sesión expira, repite el proceso de login

## Endpoints API

### `POST /api/session/login`
Login automático heurístico.

```bash
curl -X POST http://localhost:3001/api/session/login \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://homer.sii.cl/","username":"usuario","password":"contraseña"}'
```

### `GET /api/session/status`
Verifica si hay cookies guardadas.

```bash
curl http://localhost:3001/api/session/status \
  -H "Authorization: Bearer <TOKEN>"
```

### `POST /api/session/clear`
Elimina la sesión guardada.

```bash
curl -X POST http://localhost:3001/api/session/clear \
  -H "Authorization: Bearer <TOKEN>"
```

### `GET /api/render?url=...&mode=html`
Renderiza una página (usa cookies guardadas si existen).

```bash
curl "http://localhost:3001/api/render?url=https://homer.sii.cl/&mode=html" \
  -H "Authorization: Bearer <TOKEN>"
```

## Limitaciones

- **CAPTCHA/MFA**: requiere login interactivo (script headed)
- **Client certificates**: configurar en Playwright context (avanzado)
- **IP allowlist**: el servidor debe estar en la red permitida
- **Anti-bot/WAF**: puede bloquear navegadores automatizados
- **X-Frame-Options**: se muestra screenshot en vez de iframe
- **Sesión expira**: repetir login cuando las cookies caduquen

## Seguridad

⚠️ **Desarrollo**: cookies guardadas en disco sin cifrar en `data/playwright_sessions/`

🔒 **Producción**: implementar:
- Cifrado de cookies at-rest
- Almacenamiento en base de datos segura (ej: Supabase con encryption)
- Rate limiting en endpoints de login
- Auditoría de accesos
- Consentimiento explícito del usuario
- Cumplimiento con TOS del sitio destino

## Troubleshooting

### "Página mostrada como imagen (no fue posible embeber)"
El sitio tiene `X-Frame-Options: SAMEORIGIN` o CSP que impide iframe. La captura de pantalla te permite ver el contenido; usa los botones "Abrir imagen" o "Descargar" para inspeccionarla mejor.

### "connection_refused" o "timeout"
- Verifica que el sitio sea accesible desde el servidor
- Revisa firewall/network
- Algunos sitios bloquean IPs de cloud/datacenter

### Login automático falla
- Usa login interactivo (script headed) si hay CAPTCHA/MFA
- Algunos sitios requieren headers/UA específicos
- Revisa logs del servidor para más detalles

### Session expira rápidamente
- Guarda cookies después de cada login exitoso
- Algunos sitios invalidan sesiones por IP change
- Considera renovar sesión periódicamente

## Comandos Útiles

```bash
# Instalar dependencias
npm install

# Instalar Playwright
npm install playwright minimist
npx playwright install

# Dev server
npm run dev

# Login interactivo
node scripts/playwright_headed_login.js --url https://ejemplo.com/ --user-id abc123

# Ver cookies guardadas
cat data/playwright_sessions/TU_USER_ID.json

# Limpiar todas las sesiones
rm -rf data/playwright_sessions/*.json
```

## Flujo Completo (Ejemplo con homer.sii.cl)

1. **Login interactivo**:
```bash
# Obtén tu user_id desde la consola del navegador
node scripts/playwright_headed_login.js \
  --url https://homer.sii.cl/ \
  --user-id abc-123-def-456
# Completa login en el navegador que se abre
# Presiona ENTER en el terminal cuando termines
```

2. **Verificar sesión guardada**:
```bash
ls -la data/playwright_sessions/
# Deberías ver abc-123-def-456.json
```

3. **Usar en la UI**:
- Ve a Automatización
- URL: `https://homer.sii.cl/`
- Verás **✓ Sesión** (cookies cargadas)
- Marca **Mostrar en página**
- Navega dentro del sitio autenticado

4. **Resultado**:
- Si el sitio permite iframe: verás la página embebida
- Si tiene X-Frame-Options: verás screenshot con botones de descarga
- Los links dentro de la vista funcionan y mantienen la sesión
