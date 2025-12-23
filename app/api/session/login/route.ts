import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import fs from 'fs'
import path from 'path'

async function ensureDir(dir: string) {
  return fs.promises.mkdir(dir, { recursive: true }).catch(() => {})
}

function cookieStorePath(userId: string) {
  return path.join(process.cwd(), 'data', 'playwright_sessions', `${userId}.json`)
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { url, username, password } = body || {}
  if (!url || !username || !password) return NextResponse.json({ error: 'missing url/username/password' }, { status: 400 })
  const auth = req.headers.get('authorization')
  if (!auth || !auth.startsWith('Bearer ')) return NextResponse.json({ error: 'missing Authorization Bearer token' }, { status: 401 })
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
  let browser: any = null
  let context: any = null
  let page: any = null
  try {
    browser = await chromium.launch({ headless: true })
    context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    page = await context.newPage()

    // Navigate to login page
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })

    // Heuristic: try common username/email selector and password selector
    const usernameSelectors = ['input[type="email"]', 'input[name="email"]', 'input[name="username"]', 'input[type="text"]', 'input[id*=rut]']
    const passwordSelectors = ['input[type="password"]', 'input[name="password"]', 'input[id*=clave]']

    async function tryFillSelectorOnFrames(sel: string, value: string) {
      // try main page first
      try {
        const h = await page.waitForSelector(sel, { state: 'visible', timeout: 3000 }).catch(() => null)
        if (h) { await h.fill(String(value)); return true }
      } catch (e) {}
      // try every frame
      for (const f of page.frames()) {
        try {
          const fh = await f.waitForSelector(sel, { state: 'visible', timeout: 3000 }).catch(() => null)
          if (fh) { await fh.fill(String(value)); return true }
        } catch (e) {}
      }
      return false
    }

    // Try to fill username and password using selectors across frames
    let filledUser = false
    for (const us of usernameSelectors) {
      try {
        if (await tryFillSelectorOnFrames(us, username)) { filledUser = true; break }
      } catch (e) {}
    }
    let filledPass = false
    for (const ps of passwordSelectors) {
      try {
        if (await tryFillSelectorOnFrames(ps, password)) { filledPass = true; break }
      } catch (e) {}
    }

    // Fallback: attempt to set values via DOM manipulation (handles non-visible or custom inputs)
    async function fallbackSet(fieldHints: string[], val: string) {
      const frames = [page].concat(page.frames())
      for (const f of frames) {
        try {
          const ok = await f.evaluate((hints: any, v: any) => {
            for (const sel of hints) {
              try {
                const el = document.querySelector(sel)
                if (el) {
                  el.focus && el.focus()
                  el.value = v
                  el.dispatchEvent(new Event('input', { bubbles: true }))
                  el.dispatchEvent(new Event('change', { bubbles: true }))
                  return true
                }
              } catch (e) {}
            }
            return false
          }, fieldHints, String(val)).catch(() => false)
          if (ok) return true
        } catch (e) {}
      }
      return false
    }

    if (!filledUser) {
      filledUser = await fallbackSet(['input[id*=rut]', 'input[name*=rut]', 'input[placeholder*=RUT]', 'input[placeholder*=rut]'], username)
    }
    if (!filledPass) {
      filledPass = await fallbackSet(['input[id*=clave]', 'input[name*=clave]', 'input[placeholder*=Clave]', 'input[placeholder*=clave]'], password)
    }

    if (!filledUser || !filledPass) {
      // Can't find fields automatically; return informative error
      return NextResponse.json({ error: 'no_login_fields', message: 'No se detectaron/llenaron campos de login automáticos; puede requerir interacción adicional (CAPTCHA, iframe, JS dinámico).' }, { status: 422 })
    }

    // Try to submit the form by finding a submit button
    const submitSelectors = ['button[type="submit"]', 'input[type="submit"]', 'button[name="login"]', 'button:has-text("Ingresar")', 'button:has-text("Login")']
    let submitted = false
    for (const s of submitSelectors) {
      try {
        const el = await page.$(s)
        if (el) {
          await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {}), el.click()])
          submitted = true
          break
        }
      } catch (e) {
        // ignore
      }
    }

    if (!submitted) {
      // As fallback, try pressing Enter in password field
      try {
        const pw = await page.$(passwordSelectors.join(','))
        if (pw) {
          await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {}), pw.press('Enter')])
          submitted = true
        }
      } catch (e) {}
    }

    // Wait a little for potential redirects
    await page.waitForTimeout(1500)

    // Collect cookies and normalize them for later re-use by render
    const rawCookies = await context.cookies()
    const dir = path.dirname(cookieStorePath(userId))
    await ensureDir(dir)

    const originHost = (() => {
      try { return new URL(url).hostname } catch (e) { return null }
    })()

    function normalizeSameSite(ss: any) {
      if (!ss) return undefined
      const s = String(ss)
      if (/lax/i.test(s)) return 'Lax'
      if (/strict/i.test(s)) return 'Strict'
      if (/none/i.test(s)) return 'None'
      return undefined
    }

    const cookies = rawCookies.map((c: any) => {
      const domain = c.domain || originHost || undefined
      const pathVal = c.path || '/'
      const nc: any = {
        name: c.name,
        value: c.value,
        domain: domain,
        path: pathVal,
        httpOnly: !!c.httpOnly,
        secure: !!c.secure,
        sameSite: normalizeSameSite(c.sameSite),
        expires: typeof c.expires === 'number' ? c.expires : undefined,
      }
      // include url to make addCookies robust
      try { if (domain) nc.url = `https://${domain}` } catch (e) {}
      return nc
    })

    try {
      const { encryptObjectToFile } = await import('../../../../lib/sessionEncryption')
      await encryptObjectToFile(cookieStorePath(userId), cookies)
    } catch (e) {
      // fallback
      await fs.promises.writeFile(cookieStorePath(userId), JSON.stringify(cookies, null, 2), 'utf-8')
    }

    console.log('session login saved cookies', { userId, count: cookies.length, host: originHost })

    return NextResponse.json({ ok: true, saved: cookies.length })
  } catch (e) {
    console.error('session login error', String((e as any)?.message ?? e))
    // On failure, save a screenshot and HTML snapshot for debugging (dev only)
    try {
      if (process.env.NODE_ENV !== 'production' && page) {
        const fs = await import('fs')
        const path = await import('path')
        const dir = path.join(process.cwd(), 'data', 'playwright_sessions')
        await fs.promises.mkdir(dir, { recursive: true }).catch(() => {})
        const stamp = String(Date.now())
        const png = path.join(dir, `${userId || 'unknown'}-login-debug-${stamp}.png`)
        const html = path.join(dir, `${userId || 'unknown'}-login-debug-${stamp}.html`)
        try { await page.screenshot({ path: png, fullPage: true }).catch(() => {}) } catch (err) {}
        try { const body = await page.content().catch(() => ''); await fs.promises.writeFile(html, body, 'utf-8') } catch (err) {}
        console.log('wrote debug artifacts', { png, html })
      }
    } catch (err) {
      console.error('failed writing debug artifacts', String(err))
    }

    return NextResponse.json({ error: 'login_failed', message: String((e as any)?.message ?? e) }, { status: 502 })
  } finally {
    try { if (browser) await browser.close() } catch (e) {}
  }
}
