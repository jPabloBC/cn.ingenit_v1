import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const url = new URL(req.url)
    const session = url.searchParams.get('session')
    if (!session) return NextResponse.json({ error: 'missing session param' }, { status: 400 })

    // Only allow in non-production to avoid abuse
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'not allowed in production' }, { status: 403 })
    }

    const fs = await import('fs')
    const path = await import('path')
    const src = path.join(process.cwd(), 'data', 'playwright_sessions', `${session}.json`)
    const dest = path.join(process.cwd(), 'data', 'playwright_sessions', `default.json`)
    if (!fs.existsSync(src)) return NextResponse.json({ error: 'session not found' }, { status: 404 })

    fs.copyFileSync(src, dest)
    return NextResponse.json({ ok: true, bound: 'default' })
  } catch (e) {
    return NextResponse.json({ error: String((e as any)?.message ?? e) }, { status: 500 })
  }
}
