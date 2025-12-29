# Proyecto: Form Automation Desktop App

Aplicación desktop multiplataforma (macOS/Windows) usando Tauri + Node.js + Playwright para automatizar el llenado de formularios web.

## Arquitectura
- **Frontend**: Tauri (HTML/CSS/JS vanilla)
- **Backend**: Node.js + Playwright (ejecutado como sidecar)
- **Automatización**: Local, con navegador visible y delays humanos
- **Perfil**: Persistente para mantener sesión de login

## Stack Tecnológico
- Tauri 1.x
- Node.js 18+
- Playwright
- HTML/CSS/JS vanilla (sin frameworks frontend)

## Funcionalidades
- Login manual del usuario (sesión persistente)
- Lectura de datos desde CSV
- Automatización con comportamiento humano
- UI mínima: Start/Stop, selector CSV, logs y estado
- Stub de licencia por máquina (HTTP mock)
- Empaquetado para macOS y Windows
