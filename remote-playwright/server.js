const http = require('http')
const fs = require('fs')
const path = require('path')
const WebSocket = require('ws')
const playwright = require('playwright')

const PORT = process.env.PORT || 4000

const server = http.createServer((req, res) => {
  // healthcheck endpoint for production
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    return res.end('ok')
  }

  // serve static client.html
  const file = req.url === '/' ? '/client.html' : req.url
  const p = path.join(__dirname, file.split('?')[0])
  fs.readFile(p, (err, data) => {
    if (err) return res.end('Not found')
    const ext = path.extname(p)
    const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' }
    res.setHeader('Content-Type', types[ext] || 'application/octet-stream')
    res.end(data)
  })
})

const wss = new WebSocket.Server({ server })

function wsSend(ws, obj) {
  try {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj))
  } catch (e) {
    // ignore
  }
}

function toShortcut(mods, key) {
  const parts = []
  if (mods && mods.ctrl) parts.push('Control')
  if (mods && mods.alt) parts.push('Alt')
  if (mods && mods.shift) parts.push('Shift')
  if (mods && mods.meta) parts.push('Meta')
  parts.push(key)
  return parts.join('+')
}

async function handleConnection(ws, req) {
  console.log('client connected (pending auth)')
  // Require an initial auth message before launching Playwright
  const expectedToken = process.env.STREAMER_TOKEN || ''
  const signingKey = process.env.STREAMER_SIGNING_KEY || ''

  function base64urlToBuffer(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/')
    while (s.length % 4) s += '='
    return Buffer.from(s, 'base64')
  }

  function validateSignedToken(token) {
    try {
      if (!signingKey) return false
      const parts = token.split('.')
      if (parts.length !== 2) return false
      const payloadB = base64urlToBuffer(parts[0])
      const sigB = base64urlToBuffer(parts[1])
      const expected = crypto.createHmac('sha256', signingKey).update(payloadB).digest()
      if (!crypto.timingSafeEqual(expected, sigB)) return false
      const payload = JSON.parse(payloadB.toString('utf8'))
      const now = Math.floor(Date.now() / 1000)
      if (payload.exp && now > payload.exp) return false
      return true
    } catch (e) {
      return false
    }
  }

  const authTimeout = setTimeout(() => {
    try { ws.close(4003, 'auth timeout') } catch (e) {}
  }, 5000)

  // wait for first message to be auth
  const first = await new Promise((resolve) => {
    ws.once('message', (m) => resolve(m))
    ws.once('close', () => resolve(null))
  })
  clearTimeout(authTimeout)
  if (!first) {
    try { ws.close(4004, 'no auth') } catch (e) {}
    return
  }

  let ok = false
  try {
    const init = JSON.parse(first.toString())
    if (init && init.type === 'auth' && init.token) {
      if (expectedToken && init.token === expectedToken) ok = true
      else if (signingKey && validateSignedToken(init.token)) ok = true
    }
  } catch (e) {}

  if (!ok) {
    try { ws.close(4001, 'unauthorized') } catch (e) {}
    return
  }

  console.log('client authenticated')

  // now proceed to launch browser and attach handlers
  let browser
  try {
    browser = await playwright.chromium.launch({ args: ['--no-sandbox'] })
    const viewport = { width: 1280, height: 720 }
    const context = await browser.newContext({ viewport })
    const page = await context.newPage()
    await page.goto('about:blank')

    wsSend(ws, { type: 'hello', viewport, url: page.url() })

    const sendUrl = () => wsSend(ws, { type: 'navigated', url: page.url() })
    page.on('framenavigated', (frame) => {
      try {
        if (frame === page.mainFrame()) sendUrl()
      } catch (e) {
        // ignore
      }
    })

    ws.on('message', async (msg) => {
      try {
        const data = JSON.parse(msg.toString())
        if (data.type === 'goto' && data.url) {
          await page.goto(data.url)
          sendUrl()
        } else if (data.type === 'back') {
          await page.goBack().catch(() => {})
          sendUrl()
        } else if (data.type === 'forward') {
          await page.goForward().catch(() => {})
          sendUrl()
        } else if (data.type === 'reload') {
          await page.reload().catch(() => {})
          sendUrl()
        } else if (data.type === 'mouseMove') {
          const x = Number(data.x)
          const y = Number(data.y)
          if (Number.isFinite(x) && Number.isFinite(y)) {
            await page.mouse.move(x, y)
          }
        } else if (data.type === 'mouseDown') {
          const button = data.button || 'left'
          await page.mouse.down({ button })
        } else if (data.type === 'mouseUp') {
          const button = data.button || 'left'
          await page.mouse.up({ button })
        } else if (data.type === 'wheel') {
          const dx = Number(data.deltaX || 0)
          const dy = Number(data.deltaY || 0)
          await page.mouse.wheel(dx, dy)
        } else if (data.type === 'press' && data.key) {
          await page.keyboard.press(String(data.key))
        } else if (data.type === 'keyDown' && data.key) {
          const key = String(data.key)
          await page.keyboard.down(key)
        } else if (data.type === 'keyUp' && data.key) {
          const key = String(data.key)
          await page.keyboard.up(key)
        } else if (data.type === 'type' && typeof data.text === 'string') {
          if (data.text.length) await page.keyboard.type(data.text)
        } else if (data.type === 'shortcut' && data.key) {
          const key = String(data.key)
          const combo = toShortcut(data.mods || {}, key)
          await page.keyboard.press(combo)
        }
      } catch (e) {
        console.error('msg parse error', e)
      }
    })

    let closed = false
    ws.on('close', async () => {
      closed = true
      try { await browser.close() } catch (e) {}
      console.log('client disconnected')
    })

    const fps = 6
    const interval = Math.round(1000 / fps)
    while (!closed) {
      try {
        const buf = await page.screenshot({ type: 'png' })
        wsSend(ws, {
          type: 'frame',
          image: buf.toString('base64'),
          width: viewport.width,
          height: viewport.height,
          url: page.url(),
        })
      } catch (e) {
        // ignore transient screenshot errors
      }
      await new Promise((r) => setTimeout(r, interval))
    }
  } catch (e) {
    console.error('connection error', e)
    try { if (browser) await browser.close() } catch (e) {}
    try { ws.close() } catch (e) {}
  }
}

wss.on('connection', (ws) => {
  handleConnection(ws)
})

server.listen(PORT, () => console.log(`Playwright streamer listening on http://localhost:${PORT}`))
