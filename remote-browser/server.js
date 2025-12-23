const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const playwright = require('playwright');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  let file = req.url === '/' ? '/client.html' : req.url;
  const p = path.join(__dirname, file.split('?')[0]);
  fs.readFile(p, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    const ext = path.extname(p);
    const types = {'.html':'text/html','.js':'application/javascript','.css':'text/css'};
    res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

wss.on('connection', async (ws) => {
  console.log('client connected');
  let browser;
  try {
    browser = await playwright.chromium.launch({ args: ['--no-sandbox'] });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();

    // default page
    await page.goto('about:blank');

    ws.on('message', async (msg) => {
      try {
        const data = JSON.parse(msg.toString());
        if (data.type === 'goto' && data.url) {
          await page.goto(data.url);
        } else if (data.type === 'back') {
          await page.goBack().catch(()=>{});
        } else if (data.type === 'forward') {
          await page.goForward().catch(()=>{});
        } else if (data.type === 'reload') {
          await page.reload().catch(()=>{});
        }
      } catch (e) {
        console.error('message handler error', e);
      }
    });

    let closed = false;
    ws.on('close', async () => {
      closed = true;
      try { await browser.close(); } catch(e){}
      console.log('client disconnected');
    });

    // stream frames periodically
    const fps = 4;
    const intervalMs = Math.round(1000 / fps);
    while (!closed) {
      try {
        const buf = await page.screenshot({ type: 'png', quality: 70 });
        const payload = JSON.stringify({ type: 'frame', image: buf.toString('base64') });
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
      } catch (e) {
        // ignore transient errors
      }
      await new Promise(r => setTimeout(r, intervalMs));
    }
  } catch (e) {
    console.error('connection error', e);
    try { if (browser) await browser.close(); } catch(e){}
    ws.close();
  }
});

server.listen(PORT, () => console.log(`Remote-browser POC listening on http://localhost:${PORT}`));
