# Playwright streaming POC

Server runs Playwright Chromium and streams screenshots over WebSocket to the client.

Install and run

```bash
cd remote-playwright
npm install
npx playwright install
npm start
# open http://localhost:4000
```

Notes
- This runs a real Chromium instance on the server and streams rendered frames. It's not VNC; it's a headless/browser-instance streamed as images.
- For lower-latency/professional use, consider WebRTC-based streaming.
