# Worker: DTE signer (example)

Este worker es un ejemplo mínimo que muestra cómo podrías firmar un DTE y prepararlo para envío al SII.

Uso local (ejemplo):

```bash
cd workers
npm install
# Proveer claves reales para firmar: PRIVATE_KEY_PATH y CERT_PATH
PRIVATE_KEY_PATH=./priv.pem CERT_PATH=./cert.pem node index.js
```

Notas:
- Para firma real extrae `priv.pem` y `cert.pem` desde el `.p12` con `openssl pkcs12 -in file.p12 -nocerts -nodes` y `openssl pkcs12 -in file.p12 -clcerts -nokeys`.
- El worker actual realiza un mock-sign si no encuentra claves; reemplaza por una implementación completa compatible con los requisitos de firma del SII.
- Para envíos masivos, integra una cola (Redis/BullMQ) y procesa jobs en paralelo con control de rate-limits.
