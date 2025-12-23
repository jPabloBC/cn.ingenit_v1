Resumen rápido — desplegar streamer en un host Linux (persistente y automático)

1) Preparar secrets (no en repo)
- Crear archivo `/etc/default/streamer` con al menos:

  PORT=4000
  STREAMER_SIGNING_KEY="<clave-secreta-larga>"
  # o en su defecto STREAMER_TOKEN="<token-estatico>" (menos seguro)

  Asegura permisos: `chown root:root /etc/default/streamer && chmod 600 /etc/default/streamer`

2) Opción systemd (recomendado)
- Copia `deploy/streamer.service` a `/etc/systemd/system/streamer.service`
- Recarga y arranca:

  sudo systemctl daemon-reload
  sudo systemctl enable --now streamer
  sudo journalctl -u streamer -f

3) Opción PM2 (alternativa)
- Instala PM2 en el host: `npm i -g pm2`
- Copia `deploy/ecosystem.config.js` al servidor y edítalo para poner `cwd` correcto y la variable `STREAMER_SIGNING_KEY` en `env` o en variables del sistema.
- Arranca con:

  pm2 start ecosystem.config.js --env production
  pm2 save
  pm2 logs streamer

4) Configurar nginx (TLS + wss)
- Copia `deploy/nginx.streamer.conf` a `/etc/nginx/sites-available/streamer` y crea symlink a `sites-enabled`.
- Ajusta `server_name` y rutas de certificados.
- Recarga nginx: `sudo nginx -t && sudo systemctl reload nginx`

5) Next.js (tokens)
- Define `STREAMER_SIGNING_KEY` en las env del servidor donde corre Next (no en `.env.local` público).
- `/api/stream-token` firmará tokens HMAC; el cliente pedirá token y el streamer validará.

6) Validaciones post‑deploy
- `curl -I http://127.0.0.1:4000/healthz` → 200
- Desde la app en producción, comprueba `/api/streamer/status`
- UI: `/dashboard/ingestion` → activar `Usar navegador en servidor` → `Servidor: connected`

Notas:
- No expongas `NEXT_PUBLIC_STREAMER_TOKEN` en producción.
- Rotación de claves: si rotas `STREAMER_SIGNING_KEY`, invalida sesiones activas; coordina Next + streamer.
