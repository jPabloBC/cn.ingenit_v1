# CN IngenIT - web subproject

Proyecto mínimo que provee las páginas públicas de `cn.ingenit.cl`: inicio, descarga, registro y restauración de contraseña.

Arquitectura:
- Node.js + Express que sirve archivos estáticos en `public/`.

Run localmente:

```bash
cd web
npm install
npm start
```

Notas:
- La administración y gestión real de usuarios se realiza en `ingenit.cl`. Este subproyecto solo provee la interfaz pública y formularios básicos.

Puerto y ejecución:
- Por defecto el servidor intenta escuchar en el puerto `3000`. Si ese puerto está ocupado, el servidor intentará automáticamente puertos consecutivos (`3001`, `3002`, ...) hasta 10 intentos.
- Para forzar un puerto específico, exporta la variable de entorno `PORT`, por ejemplo:

```bash
PORT=3001 npm start
```

- El servidor ahora escribe el puerto usado en el archivo `port.info` dentro de la carpeta `web/` al iniciar. Esto facilita descubrir el puerto elegido por el proceso automático.


