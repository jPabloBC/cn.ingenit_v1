import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET(req: NextRequest) {
  // safety: only enable when DEBUG_RENDER=1 to avoid exposing open renderer
  if (process.env.DEBUG_RENDER !== '1') {
    return NextResponse.json({ error: 'debug render disabled. set DEBUG_RENDER=1 to enable' }, { status: 403 })
  }

  const url = req.nextUrl.searchParams.get('url')
  const userId = req.nextUrl.searchParams.get('userId')
  if (!url) return NextResponse.json({ error: 'missing url' }, { status: 400 })
  if (!userId) return NextResponse.json({ error: 'missing userId' }, { status: 400 })

  // load cookies file if exists
  const cookieFile = path.join(process.cwd(), 'data', 'playwright_sessions', `${userId}.json`)
  let cookies: any[] = []
  if (fs.existsSync(cookieFile)) {
    try {
      const { decryptObjectFromFile } = await import('../../../../lib/sessionEncryption')
      const maybe = await decryptObjectFromFile(cookieFile)
      // decryptObjectFromFile may return null; ensure we keep an array
      cookies = Array.isArray(maybe) ? maybe : []
    } catch (e) {
      try {
        const raw = fs.readFileSync(cookieFile, 'utf-8')
        cookies = JSON.parse(raw)
      } catch (err) {}
    }
  }

  // import playwright dynamically
  let playwright: any
  try {
    playwright = await import('playwright')
  } catch (e) {
    return NextResponse.json({ error: 'playwright not installed', detail: String((e as any)?.message ?? e) }, { status: 501 })
  }

  const { chromium } = playwright
  let browser: any = null
  try {
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    if (Array.isArray(cookies) && cookies.length) {
      // normalize cookies minimally
      const normalized = cookies.map((c: any) => {
        const domain = c.domain || (function(){ try { return new URL(url).hostname } catch(e){ return undefined } })()
        const nc: any = {
          name: c.name,
          value: c.value,
          domain: domain,
          path: c.path || '/',
          httpOnly: !!c.httpOnly,
          secure: !!c.secure,
          sameSite: c.sameSite || undefined,
          expires: typeof c.expires === 'number' ? c.expires : undefined,
        }
        try { if (domain) nc.url = `https://${domain}` } catch (e) {}
        return nc
      })
      try { await context.addCookies(normalized) } catch (e) { /* ignore */ }
    }
    const page = await context.newPage()
    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {})
    const html = await page.content()
    return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html' } })
  } catch (e) {
    return NextResponse.json({ error: 'render_error', message: String((e as any)?.message ?? e) }, { status: 502 })
  } finally {
    try { if (browser) await browser.close() } catch (e) {}
  }
}
