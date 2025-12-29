#!/bin/bash

# Script de setup inicial para macOS/Linux

echo "🚀 Configurando Form Automation App..."

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js no está instalado"
    echo "Descárgalo desde: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js $(node -v)"

# Verificar Rust
if ! command -v cargo &> /dev/null; then
    echo "❌ Rust no está instalado"
    echo "Instálalo ejecutando: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    exit 1
fi

echo "✅ Rust $(rustc --version)"

# Instalar dependencias principales
echo ""
echo "📦 Instalando dependencias principales..."
npm install

# Instalar dependencias de automatización
echo ""
echo "📦 Instalando dependencias de automatización..."
cd automation
npm install

# Instalar navegadores Playwright
echo ""
echo "🌐 Instalando navegadores Playwright..."
npx playwright install chromium

cd ..

echo ""
echo "✅ ¡Setup completado!"
echo ""
echo "Próximos pasos:"
echo "  1. Edita automation/src/index.js para configurar la URL del formulario"
echo "  2. Ejecuta: npm run dev"
echo "  3. Selecciona test.csv y haz clic en Iniciar"
echo ""
