import { NextResponse } from 'next/server'

export async function GET() {
  const port = process.env.STREAMER_PORT || '4000'
  const base = `http://localhost:${port}`
  try {
    const res = await fetch(`${base}/healthz`)
    return NextResponse.json({ ok: res.ok, url: base })
  } catch (e) {
    return NextResponse.json({ ok: false, url: base })
  }
}
