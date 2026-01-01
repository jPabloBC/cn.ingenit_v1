# Tauri Updater — Setup guide (template)

Breve descripción: esta guía contiene pasos mínimos para habilitar actualizaciones automáticas usando GitHub Releases y Tauri Updater.

1) Requisitos
- Cuenta GitHub y repo donde subirás releases.
- Secrets en GitHub Actions: `GITHUB_TOKEN` (automático), y opcionalmente claves para firmar builds.
- Para macOS notarización necesitas Apple Developer account (certificate + notarization). Para Windows, CLS/EV certs si quieres evitar warnings.

2) `tauri.conf.json` (ya agregado)
- Edita `src-tauri/tauri.conf.json` y reemplaza `<OWNER>` y `<REPO>` en `tauri.updater.endpoints` por tu owner/repo.
  Ejemplo:
  `https://api.github.com/repos/myorg/cn-ingenit/releases/latest`

3) Frontend (renderer)
- Escucha los eventos del updater para informar al usuario. Ejemplo (renderer JS):

  import { checkUpdate, installUpdate, event } from '@tauri-apps/api/updater'

  // Trigger manual
  await checkUpdate();

  // Listen for `update-available`, `update-not-available`, `error`, `download-progress`, `updated`
  event.listen('tauri://update-available', () => { /* show UI */ })

Nota: esta app tiene `allowlist.all = true` en `tauri.conf.json`, por lo que APIs están disponibles.

4) CI: GitHub Actions (plantilla)
- Crear workflow que construya para cada plataforma y cree Release con artefactos.
- Ejemplo de plantilla en `.github/workflows/release.yml` (creada en repo). Reemplaza los pasos de firma/notarización según necesidad.

5) Firma y Notarización
- macOS: Apple Developer ID (sign, then notarize). Tauri docs muestran comandos `notarize`.
- Windows: firmar con certificado. Sin firma, usuarios verán advertencias.

6) Publicación
- El workflow crea un Release en GitHub con tag `vX.Y.Z` y sube los instaladores. Tauri Updater leerá `releases/latest` y podrá ofrecer la actualización.

7) Pruebas
- Publica un release con un tag `v1.1.0` y sube un archivo `.zip`/`.dmg`/`.msi`. Abre la app y prueba `checkUpdate()`.

---
Si quieres, personalizo el workflow con pasos de notarización y signing para macOS/Windows — dime si tienes certificados y acceso a Apple Developer para seguir.