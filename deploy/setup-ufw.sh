#!/usr/bin/env bash
set -euo pipefail

# setup-ufw.sh
# Minimal UFW setup for a VM running the streamer behind nginx.

if [[ $(id -u) -ne 0 ]]; then
  echo "Run as root: sudo $0"
  exit 1
fi

echo "Allow SSH"
ufw allow OpenSSH

echo "Allow HTTP & HTTPS"
ufw allow 80/tcp
ufw allow 443/tcp

echo "Optional: allow health check port if used (e.g., 4000 direct)"
# ufw allow 4000/tcp

echo "Enable UFW (y/n to continue)"
ufw --force enable

echo "UFW status:"
ufw status verbose
#!/usr/bin/env bash
set -euo pipefail

# setup-ufw.sh
# Secure the VM firewall using UFW. Run as root.

echo "Installing and enabling UFW..."
apt update
apt install -y ufw

# Allow SSH, HTTP, HTTPS
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp

# Optional: allow custom streamer port if not behind nginx
# ufw allow 4000/tcp

ufw --force enable
ufw status verbose

echo "UFW configured: SSH, HTTP(80), HTTPS(443) allowed."
