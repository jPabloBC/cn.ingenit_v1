#!/usr/bin/env bash
set -euo pipefail

# Setup and run streamer on macOS
# Usage: bash scripts/setup-and-run-streamer-macos.sh [--port 4000] [--token mytoken]

PORT=${1:-4000}
TOKEN=${2:-mi_token_secreto}

echo "PORT=${PORT} TOKEN=${TOKEN}"

# 1) Install Homebrew (no-fail)
if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew not found — installing..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" || true
fi

# 2) Install Node if missing
if ! command -v node >/dev/null 2>&1; then
  echo "Installing Node via brew..."
  brew install node
fi

# 3) Install ngrok if missing
if ! command -v ngrok >/dev/null 2>&1; then
  echo "Installing ngrok via brew tap..."
  brew tap nwtgck/homebrew-ngrok || true
  brew install ngrok || true
  echo "If you have an ngrok authtoken, run: ngrok authtoken YOUR_AUTHTOKEN"
fi

# 4) Change to project
cd "$(dirname "$0")/.." || exit 1
cd "$PWD"

echo "Project dir: $(pwd)"

# 5) Install deps
echo "Running npm ci..."
npm ci

# 6) Install Playwright browsers
echo "Installing Playwright browsers..."
npx playwright install

# 7) Run the helper script (starts streamer and optionally ngrok)
echo "Starting streamer (this will run until you Ctrl+C)"
npm run run-streamer -- --ngrok --port=${PORT} --token=${TOKEN}
