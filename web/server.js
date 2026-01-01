const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const fs = require('fs');
// Load environment variables from web/.env.local if present
require('dotenv').config({ path: path.join(__dirname, '.env.local') });

// Configurable API base and optional authorization header
const API_BASE = (process.env.API_BASE || 'https://ingenit.cl/api').replace(/\/+$/, '');
const INGENIT_AUTH_HEADER = process.env.INGENIT_AUTH_HEADER || (process.env.INGENIT_API_KEY ? `Bearer ${process.env.INGENIT_API_KEY}` : null);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.post('/register', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).send('missing email');
  // This repo provides the public UI only. Integración administrativa debe
  // realizarse en ingenit.cl. Aquí solo confirmamos recepción y redirigimos.
  return res.redirect('/?registered=1');
});

app.post('/reset', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).send('missing email');
  return res.redirect('/?reset=1');
});

// Proxy endpoint to call admin API at ingenit.cl from the server side
app.post('/api/proxy/admin/cn/set-password', async (req, res) => {
  const target = `${API_BASE}/admin/cn/set-password`;
  try {
    // Build headers explicitly to avoid passing client-only headers
    const headers = {
      'content-type': 'application/json'
    };
    if (INGENIT_AUTH_HEADER) headers['authorization'] = INGENIT_AUTH_HEADER;

    const fetchRes = await fetch(target, {
      method: 'POST',
      headers,
      body: JSON.stringify(req.body),
      redirect: 'follow'
    });

    const contentType = fetchRes.headers.get('content-type') || '';
    const status = fetchRes.status;
    if (contentType.includes('application/json')) {
      const json = await fetchRes.json().catch(() => null);
      return res.status(status).json(json || { message: 'ok' });
    }
    const text = await fetchRes.text().catch(() => '');
    res.type('text').status(status).send(text);
  } catch (err) {
    console.error('Proxy error:', err && err.message ? err.message : err);
    return res.status(502).json({ error: 'proxy_error', message: String(err) });
  }
});

const MAX_RETRIES = 10;

function startServer(port, attempt = 0) {
  const server = app.listen(port, () => {
    console.log(`cn.ingenit web subproject listening on http://localhost:${port}`);
    try {
      fs.writeFileSync(path.join(__dirname, 'port.info'), String(port), 'utf8');
    } catch (e) {
      console.warn('Could not write port.info file:', e.message);
    }
  });

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      if (attempt >= MAX_RETRIES) {
        console.error(`Port ${port} is in use and max retries reached. Exiting.`);
        process.exit(1);
      }
      const nextPort = port + 1;
      console.warn(`Port ${port} is already in use — trying port ${nextPort} (attempt ${attempt + 1}/${MAX_RETRIES})`);
      // try next port
      startServer(nextPort, attempt + 1);
      return;
    }
    console.error('Server error:', err);
    process.exit(1);
  });
}

startServer(PORT);
