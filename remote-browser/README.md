# Remote Browser POC (Playwright + WebSocket frames)

Simple proof-of-concept that launches a real Chromium via Playwright on the server,
captures periodic screenshots and pushes them over a WebSocket to a browser client.

Not low-latency like WebRTC, but demonstrates a server-run real browser instance.

Usage

1. Install deps and Playwright browsers:

```bash
cd remote-browser
npm install
npx playwright install
```

2. Start server:

```bash
npm start
# or: node server.js
```

3. Open your browser at http://localhost:3000

Controls: enter URL and click "Ir"; use Atrás/Adelante/Recargar to navigate.

Notes
- This runs Chromium on the machine where the server is started.
- It's a POC to show a headless/headful browser rendering streamed to the client.
- For production, consider WebRTC-based streaming or managed browser services.
