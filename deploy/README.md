# Deploy streamer on a VM (nginx + certbot)

This folder contains helper files to deploy the Playwright streamer on an Ubuntu VM with `nginx` SSL termination and `systemd` service.

Prerequisites:
- A VM (Ubuntu 22.04+) with a public IPv4 address.
- A DNS A record for `streamer.cn.ingenit.cl` pointing to the VM's IP.
- Replace `REPO_URL` below with the Git repository URL for this project.

Quick steps (on the VM):

1. SSH to the VM and become root:

```bash
sudo -i
```

2. Run the installer script (example):

```bash
sudo /path/to/install_streamer.sh git@github.com:yourorg/yourrepo.git streamer.cn.ingenit.cl you@domain.tld
```

3. Edit environment for tokens:

```bash
sudo $EDITOR /etc/streamer/streamer.env
# set STREAMER_TOKEN or STREAMER_SIGNING_KEY
sudo systemctl restart streamer.service
```

4. Verify:

```bash
systemctl status streamer.service
curl -vk https://streamer.cn.ingenit.cl/
```

Notes:
- The script installs Node.js 18 using NodeSource, `nginx`, `certbot` and Playwright browsers. Adjust as needed for your environment.
- Ensure the DNS A record is correct before requesting certbot certificate.
- The systemd unit runs the streamer as `www-data`. Change `User=` in `deploy/streamer.service` if you prefer a different user.
