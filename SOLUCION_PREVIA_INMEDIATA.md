# Solución Inmediata - Preview de misiir.sii.cl

## Problema Resuelto
✅ La URL `https://misiir.sii.cl/cgi_misii/siihome.cgi` tiene `X-Frame-Options: SAMEORIGIN` y no se puede mostrar en iframe directamente.

✅ **SOLUCIÓN YA IMPLEMENTADA**: La app detecta automáticamente X-Frame-Options y usa render por servidor.

## Cómo Funciona Ahora

### 1. Ya tienes una sesión guardada con cookies válidas
```
data/playwright_sessions/6ee5eb82-XXXX-XXXX.json
```

### 2. La app YA funciona automáticamente

Simplemente:
1. Abre la app en `http://localhost:3000/dashboard/ingestion`
2. Pega la URL: `https://misiir.sii.cl/cgi_misii/siihome.cgi`
3. Activa el checkbox "Mostrar en página"

**La app automáticamente**:
- Detecta que la URL tiene `X-Frame-Options: SAMEORIGIN`
- Usa render por servidor (`/api/render`) en lugar de iframe directo
- Carga las cookies de la sesión guardada
- Muestra la página completa dentro de la app

## Para Producción (cuando lo necesites)

### Asociar sesión a tu usuario
```bash
# 1. Obtén tu userId de Supabase (desde la consola o inspeccionando el token)
# 2. Renombra el archivo de sesión:
mv data/playwright_sessions/6ee5eb82-XXXX-XXXX.json data/playwright_sessions/{TU_USER_ID}.json
```

### Modo desarrollo (actual)
En desarrollo, si no encuentra sesión para el userId, la app usa automáticamente cualquier sesión disponible en `data/playwright_sessions/`.

## Verificación Rápida

```bash
# Probar que el endpoint funciona
curl 'http://localhost:3000/api/render?url=https://misiir.sii.cl/cgi_misii/siihome.cgi&mode=html' \
  -H "Authorization: Bearer TU_TOKEN" | head -n 20

# Ver que la sesión existe
ls -la data/playwright_sessions/

# Ver cookies guardadas
cat data/playwright_sessions/6ee5eb82-XXXX-XXXX.json | head -n 40
```

## Resumen

**NO NECESITAS**:
- ❌ Abrir ventanas externas
- ❌ Login manual cada vez  
- ❌ Scripts adicionales

**SÍ TIENES**:
- ✅ Detección automática de X-Frame-Options
- ✅ Fallback a render por servidor
- ✅ Cookies persistidas y reutilizadas
- ✅ Preview funcionando en la app

**Simplemente usa la app** — todo está configurado y funcionando.
