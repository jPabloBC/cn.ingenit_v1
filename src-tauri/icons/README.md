# Placeholder para iconos

Los iconos de la aplicación deben colocarse en esta carpeta.

## Archivos requeridos:

- `32x32.png` - Icono 32x32 píxeles
- `128x128.png` - Icono 128x128 píxeles
- `128x128@2x.png` - Icono 128x128 píxeles @2x (256x256)
- `icon.icns` - Icono para macOS
- `icon.ico` - Icono para Windows

## Generación de iconos:

Puedes usar herramientas online como:
- https://www.iconfinder.com/
- https://www.canva.com/
- https://favicon.io/

O usar Tauri CLI para generar desde una imagen base:

```bash
npm install -g @tauri-apps/cli
tauri icon path/to/icon.png
```

Esto generará automáticamente todos los tamaños necesarios.

## Temporalmente:

Para desarrollo, Tauri usará iconos por defecto si estos no están presentes.
