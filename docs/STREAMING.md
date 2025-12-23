# Streaming de navegador (noVNC) — Instrucciones

Este documento explica un flujo seguro y sencillo para ofrecer a los usuarios un navegador "real" alojado en el servidor usando una imagen VNC + noVNC.

Importante: no automatizar ni evadir medidas de seguridad de terceros (CAPTCHA, MFA, client certs, IP allowlists). Este flujo simplemente permite que un usuario interactúe con un navegador real en el servidor.

Requisitos:
- Docker instalado en el servidor
- Puertos disponibles: `5901` (VNC) y `6081` (noVNC web UI)
- `ALLOW_BROWSER_STREAMING=1` en las variables de entorno de la app (para permitir endpoints)

Ejemplo mínimo (comando):

```bash
# ejecuta un contenedor con escritorio y noVNC (imagen de ejemplo)
docker run -d --rm \
  --name cn_browser_1 \
  -p 5901:5900 \  # VNC
  -p 6081:6080 \  # noVNC web UI
  dorowu/ubuntu-desktop-lxde-vnc
```

Luego, abre en tu navegador:

- http://<SERVER_HOST>:6081/vnc.html?host=<SERVER_HOST>&port=6081&autoconnect=true

Notas de seguridad y operativas:
- Es responsabilidad del operador del servidor rotar/limpiar contenedores y auditar accesos.
- Evita exponer noVNC públicamente sin autenticación; usa redes internas o un proxy autenticado.
- Para producción, orquesta contenedores por usuario, genere tokens efímeros y limite tiempo de sesión.

Implementación en la app:
- El endpoint `/api/stream/start` devuelve instrucciones y registra la solicitud en `data/stream_logs.jsonl`.
- El endpoint `/api/stream/stop` registra la petición de cierre.
