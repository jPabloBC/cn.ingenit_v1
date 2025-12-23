import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import fs from 'fs'
import path from 'path'

function cookieStorePath(userId: string) {
  return path.join(process.cwd(), 'data', 'playwright_sessions', `${userId}.json`)
}

async function ensureDir(dir: string) {
  return fs.promises.mkdir(dir, { recursive: true }).catch(() => {})
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { url } = body || {}
  if (!url) return NextResponse.json({ error: 'missing url' }, { status: 400 })

  const auth = req.headers.get('authorization')
  if (!auth || !auth.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'missing Authorization Bearer token' }, { status: 401 })
  }
  const token = auth.split(' ')[1]
  let userId = 'anonymous'
  try {
    const u = await supabaseAdmin.auth.getUser(token)
    if (!u?.data?.user) return NextResponse.json({ error: 'invalid token' }, { status: 401 })
    userId = u.data.user.id
  } catch (e) {
    return NextResponse.json({ error: 'invalid token' }, { status: 401 })
  }

  let playwright: any
  try {
    playwright = await import('playwright')
  } catch (e) {
    return NextResponse.json({ error: 'playwright not installed', detail: String((e as any)?.message ?? e) }, { status: 501 })
  }

  const { chromium } = playwright
  
  // Launch headed browser for interactive login (async, don't block response)
  setImmediate(async () => {
    let browser: any = null
    try {
      browser = await chromium.launch({ 
        headless: false,
        args: ['--start-maximized']
      })
      const context = await browser.newContext({ 
        viewport: null,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      })
      const page = await context.newPage()

      // Navigate to the URL
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})

      // Keep browser open for 15 minutes or until user closes it
      await new Promise(resolve => setTimeout(resolve, 900000)) // 15 min

      // Save cookies before closing
      try {
        const cookies = await context.cookies()
        const dir = path.dirname(cookieStorePath(userId))
        await ensureDir(dir)
        try {
          const { encryptObjectToFile } = await import('../../../../lib/sessionEncryption')
          await encryptObjectToFile(cookieStorePath(userId), cookies)
        } catch (e) {
          await fs.promises.writeFile(cookieStorePath(userId), JSON.stringify(cookies, null, 2), 'utf-8')
        }
        console.log(`Saved ${cookies.length} cookies for user ${userId}`)
      } catch (e) {
        console.error('Failed to save cookies:', e)
      }
    } catch (e: any) {
      console.error('interactive session error', String((e as any)?.message ?? e))
    } finally {
      try { if (browser) await browser.close() } catch (e) {}
    }
  })

  // Return immediately so client can poll for cookies
  return NextResponse.json({ 
    ok: true, 
    message: `Navegador abierto en ${url}. Complete el login y el navegador permanecerá abierto mientras hace login. Las cookies se guardarán automáticamente.`
  })
}
