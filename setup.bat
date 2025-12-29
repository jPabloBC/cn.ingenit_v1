@echo off
REM Script de setup inicial para Windows

echo 🚀 Configurando CN IngenIT App...

REM Verificar Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Node.js no está instalado
    echo Descárgalo desde: https://nodejs.org/
    exit /b 1
)

echo ✅ Node.js instalado

REM Verificar Rust
where cargo >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Rust no está instalado
    echo Descárgalo desde: https://rustup.rs/
    exit /b 1
)

echo ✅ Rust instalado

REM Instalar dependencias principales
echo.
echo 📦 Instalando dependencias principales...
call npm install

REM Instalar dependencias de automatización
echo.
echo 📦 Instalando dependencias de automatización...
cd automation
call npm install

REM Instalar navegadores Playwright
echo.
echo 🌐 Instalando navegadores Playwright...
call npx playwright install chromium

cd ..

echo.
echo ✅ ¡Setup completado!
echo.
echo Próximos pasos:
echo   1. Edita automation\src\index.js para configurar la URL del formulario
echo   2. Ejecuta: npm run dev
echo   3. Selecciona test.csv y haz clic en Iniciar
echo.

pause
