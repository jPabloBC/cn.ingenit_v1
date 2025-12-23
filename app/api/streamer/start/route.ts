import { NextResponse } from 'next/server'
import path from 'path'

export async function GET() {
  const port = process.env.STREAMER_PORT || '4000'
  const base = `http://localhost:${port}`

  // quick healthcheck
  try {
    const res = await fetch(`${base}/healthz`)
    if (res.ok) return NextResponse.json({ ok: true, started: true, url: base })
  } catch (e) {
    // not running
  }

  // spawn the streamer as a detached background process (local/dev use)
  // disable on-demand spawn in production builds/environments
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ ok: false, error: 'on-demand streamer start disabled in production' }, { status: 501 })
  }

  try {
    // use dynamic require via eval to avoid static bundler analysis
    const cp = eval("require")('child_process')
    const cwd = path.resolve(process.cwd(), 'remote-playwright')
    const node = process.execPath || 'node'
    const env = Object.assign({}, process.env, { PORT: port, STREAMER_TOKEN: process.env.STREAMER_TOKEN || process.env.NEXT_PUBLIC_STREAMER_TOKEN || '' })

    const serverPath = [process.cwd(), 'remote-playwright', 'server.js'].join(path.sep)
    const child = cp.spawn(node, [serverPath], { env, detached: true, stdio: 'ignore' })
    try { child.unref() } catch (e) {}

    // wait briefly for startup
    const started = await (async () => {
      for (let i = 0; i < 12; i++) {
        try {
          const r = await fetch(`${base}/healthz`)
          if (r.ok) return true
        } catch (e) {}
        await new Promise((r) => setTimeout(r, 250))
      }
      return false
    })()

    return NextResponse.json({ ok: started, started: started, url: base })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
