#!/usr/bin/env bash
set -euo pipefail

# install_streamer.sh
# Provision an Ubuntu VM for the Playwright streamer.
# Usage: sudo ./install_streamer.sh REPO_URL STREAMER_DOMAIN ADMIN_EMAIL

REPO_URL=${1:-}
STREAMER_DOMAIN=${2:-streamer.cn.ingenit.cl}
ADMIN_EMAIL=${3:-admin@example.com}

if [[ -z "$REPO_URL" ]]; then
  echo "Usage: sudo $0 REPO_URL [STREAMER_DOMAIN] [ADMIN_EMAIL]"
  exit 1
fi

APP_DIR=/opt/streamer

echo "Updating apt and installing prerequisites..."
apt update
apt install -y curl git nginx certbot python3-certbot-nginx build-essential

echo "Installing Node.js (18.x via NodeSource)..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

echo "Cloning repo into $APP_DIR..."
rm -rf "$APP_DIR"
git clone "$REPO_URL" "$APP_DIR"

cd "$APP_DIR"
echo "Installing npm dependencies..."
npm ci --production

echo "Installing Playwright browsers..."
npx playwright install --with-deps || true

echo "Creating environment dir and example env..."
mkdir -p /etc/streamer
cat > /etc/streamer/streamer.env <<EOF
# Example streamer environment
PORT=4000
STREAMER_TOKEN=
STREAMER_SIGNING_KEY=
EOF

echo "Installing systemd unit..."
cp deploy/streamer.service /etc/systemd/system/streamer.service
systemctl daemon-reload
systemctl enable --now streamer.service || true

echo "Installing nginx config..."
cp deploy/nginx.streamer.conf /etc/nginx/sites-available/streamer
ln -sf /etc/nginx/sites-available/streamer /etc/nginx/sites-enabled/streamer
nginx -t
systemctl reload nginx

echo "Requesting TLS certificate via certbot (ensure DNS A record points to this VM)..."
certbot --nginx -d "$STREAMER_DOMAIN" --non-interactive --agree-tos --email "$ADMIN_EMAIL" || true

echo "Restarting nginx and streamer service..."
systemctl restart nginx || true
systemctl restart streamer.service || true

echo "Done. Edit /etc/streamer/streamer.env to configure tokens and restart systemd service if needed."
