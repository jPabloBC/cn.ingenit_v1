# CN IngenIT Desktop App

Aplicación desktop multiplataforma (macOS/Windows) para automatizar el llenado de formularios web usando **Tauri + Node.js + Playwright**.

## 🎯 Características

- ✅ **Automatización local** con navegador visible
- ✅ **Perfil persistente** de navegador (mantiene sesión de login)
- ✅ **Lectura de datos** desde archivos CSV
- ✅ **Delays humanos** para evitar detección
- ✅ **UI mínima** con controles Start/Stop, logs y estadísticas
- ✅ **Stub de licencia** por máquina (preparado para validación HTTP)
- ✅ **Empaquetado** para macOS y Windows

## 📁 Estructura del Proyecto

```
cn.ingenit_v1/
├── ui/                      # Frontend (Tauri UI)
│   ├── index.html          # Interfaz principal
│   ├── styles.css          # Estilos
│   └── app.js              # Lógica frontend
├── src-tauri/              # Backend Tauri (Rust)
│   ├── src/
│   │   └── main.rs         # Comandos Tauri e IPC
│   ├── Cargo.toml          # Dependencias Rust
│   ├── tauri.conf.json     # Configuración Tauri
│   └── build.rs            # Script de build
├── automation/             # Backend Node.js
│   ├── src/
│   │   ├── index.js        # Script principal de automatización
│   │   ├── license.js      # Validación de licencia
│   │   └── utils.js        # Utilidades (delays, etc.)
│   └── package.json        # Dependencias Node.js
├── .github/
│   └── copilot-instructions.md
├── package.json            # Proyecto principal
└── README.md               # Este archivo
```

## 🚀 Setup Inicial

### Requisitos

- **Node.js** 18+ ([descargar](https://nodejs.org/))
- **Rust** ([descargar](https://rustup.rs/))
- **Git** ([descargar](https://git-scm.com/))

### Instalación

```bash
# 1. Instalar dependencias principales
npm install

# 2. Instalar dependencias de automatización
cd automation
npm install
cd ..

# 3. Instalar Playwright browsers
cd automation
npx playwright install chromium
cd ..
```

## 🎮 Uso en Desarrollo

```bash
# Ejecutar en modo desarrollo
npm run dev
```

Esto abrirá la aplicación desktop con hot-reload activado.

### Preparar archivo CSV de ejemplo

Crea un archivo `test.csv` con el siguiente formato:

```csv
nombre,email,telefono
Juan Pérez,juan@example.com,555-1234
María García,maria@example.com,555-5678
```

### Ajustar automatización

Edita [automation/src/index.js](automation/src/index.js) para configurar:

1. **URL del formulario**: Cambiar `TARGET_URL` (línea 8)
2. **Selectores CSS**: Ajustar según los campos del formulario real
3. **Lógica de llenado**: Método `processRow()` (línea 55)

## 📦 Empaquetado

### Compilar binario de automatización

```bash
# Construir el ejecutable Node.js
cd automation
npm run build
cd ..
```

Esto genera binarios en `automation/dist/`:
- `automation-macos-x64` (macOS Intel)
- `automation-macos-arm64` (macOS Apple Silicon)
- `automation-win-x64.exe` (Windows)

### Empaquetar aplicación completa

```bash
# Para tu plataforma actual
npm run build

# Los instaladores se generan en:
# src-tauri/target/release/bundle/
```

#### Empaquetado específico por plataforma:

**macOS:**
```bash
npm run build
# Genera: .dmg y .app en src-tauri/target/release/bundle/macos/
```

**Windows (desde macOS):**
```bash
# Requiere configuración adicional de cross-compilation
# Recomendado: usar una VM o CI/CD de Windows
```

## 🔧 Configuración

### Navegador Persistente

El perfil del navegador se guarda en `automation/.browser-profile/`.

**Primera ejecución:**
1. Inicia la automatización
2. El navegador se abrirá
3. Haz login manual en el sitio web
4. La sesión quedará guardada para ejecuciones futuras

### Sistema de Licencias

El stub de licencia está en [automation/src/license.js](automation/src/license.js).

**Modo actual**: Siempre retorna `true` (desarrollo).

**Para activar validación real**:
1. Descomentar líneas 26-38 en `license.js`
2. Configurar `LICENSE_SERVER` con tu endpoint
3. El servidor debe responder: `{ "valid": true/false }`

### Delays y Comportamiento Humano

Configurados en [automation/src/utils.js](automation/src/utils.js):

- `randomDelay(min, max)`: Delay aleatorio
- `humanDelay()`: Delay típico entre acciones (800-1800ms)
- `humanClick()`: Clic con movimiento de mouse natural
- `humanType()`: Escritura simulando tecleo humano

## 🐛 Troubleshooting

### Error: "automation binary not found"

```bash
cd automation
npm run build
cd ..
```

### Error: "Playwright browsers not installed"

```bash
cd automation
npx playwright install chromium
cd ..
```

### Error de permisos en macOS

Al abrir la app empaquetada por primera vez:
1. Click derecho → "Abrir"
2. Confirmar en el diálogo de seguridad

### CSV no se carga

Verifica que:
- El archivo tiene extensión `.csv`
- La primera línea contiene los nombres de columnas
- Las columnas coinciden con los campos esperados en `index.js`

## 📝 Notas de Desarrollo

### Comunicación Frontend-Backend

- **Frontend (UI)** → **Tauri Backend (Rust)**: Comandos Tauri (`invoke()`)
- **Tauri Backend** → **Automation (Node.js)**: Proceso hijo / sidecar
- **Logs**: Actualmente solo en consola, mejora pendiente para streaming a UI

### Próximas mejoras sugeridas

- [ ] Streaming de logs desde Node.js a UI en tiempo real
- [ ] Configuración de URL/selectores desde UI (sin editar código)
- [ ] Pausar/reanudar automatización
- [ ] Reportes de errores con screenshots
- [ ] Auto-actualización de la aplicación

## 📄 Licencia

Proyecto privado - Todos los derechos reservados

## 🤝 Soporte

Para problemas o preguntas, contactar al equipo de desarrollo.

---

**Versión**: 1.0.0  
**Última actualización**: Diciembre 2025
