import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { getOrCreateProxyTokenForUser } from '../../../lib/proxyToken'

function resolveAbsolute(base: string, relative: string) {
  try {
    return new URL(relative, base).toString()
  } catch (e) {
    return relative
  }
}

function decodeHtmlEntities(str: string): string {
  return str.replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
}

function rewriteHtmlForProxy(html: string, baseUrl: string, proxyBase: string, proxyToken?: string) {
  // Rewrite href/src attributes to proxy through /api/proxy?url=
  let rewritten = html.replace(/(href|src)=("|')([^"'>]+)("|')/gi, (m, attr, q1, val) => {
    let v = String(val)
    // Decode HTML entities in URLs before processing
    v = decodeHtmlEntities(v)
    if (v.startsWith('data:') || v.startsWith('mailto:') || v.startsWith('tel:')) return m
    const abs = resolveAbsolute(baseUrl, v)
    const tokenPart = proxyToken ? `&pt=${encodeURIComponent(proxyToken)}` : ''
    const prox = `${proxyBase}/api/proxy?url=${encodeURIComponent(abs)}${tokenPart}`
    // For href attributes, also keep the original absolute URL in a data-orig
    // and inject an inline onclick that posts navigation to the parent and
    // prevents the default navigation inside the iframe.
    if (attr.toLowerCase() === 'href') {
      const encoded = encodeURIComponent(abs)
      // set proxied href but keep the original absolute URL encoded in a data attribute
      const proxWithOrig = `${prox}&orig=${encodeURIComponent(baseUrl)}`
      return `${attr}=${q1}${proxWithOrig}${q1} data-ingestion-href=${q1}${encoded}${q1}`
    }
    return `${attr}=${q1}${prox}&orig=${encodeURIComponent(baseUrl)}${q1}`
  })

  // Rewrite srcset values (comma separated URLs)
  rewritten = rewritten.replace(/srcset=("|')([^"']+)("|')/gi, (m, q, val) => {
    const parts = String(val).split(',').map(p => p.trim()).map(p => {
      const [urlPart, descriptor] = p.split(/\s+/)
      const decoded = decodeHtmlEntities(urlPart)
      const abs = resolveAbsolute(baseUrl, decoded)
      const tokenPart = proxyToken ? `&pt=${encodeURIComponent(proxyToken)}` : ''
      return `${proxyBase}/api/proxy?url=${encodeURIComponent(abs)}${tokenPart}&orig=${encodeURIComponent(baseUrl)}${descriptor ? ' ' + descriptor : ''}`
    })
    return `srcset=${q}${parts.join(', ')}${q}`
  })

  // Rewrite url() in CSS (both style attributes and <style> tags)
  rewritten = rewritten.replace(/url\((['"']?)([^)'"\s]+)\1\)/gi, (m, q, val) => {
    let v = String(val).trim()
    v = decodeHtmlEntities(v)
    if (v.startsWith('data:')) return m
    const abs = resolveAbsolute(baseUrl, v)
    const tokenPart = proxyToken ? `&pt=${encodeURIComponent(proxyToken)}` : ''
    const prox = `${proxyBase}/api/proxy?url=${encodeURIComponent(abs)}${tokenPart}&orig=${encodeURIComponent(baseUrl)}`
    return `url(${q}${prox}${q})`
  })

  // previously we injected onclick via a second pass; now handled inline above

  return rewritten
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  const mode = (req.nextUrl.searchParams.get('mode') || 'html') as 'html' | 'screenshot'
  if (!url) return NextResponse.json({ error: 'missing url' }, { status: 400 })
  if (!/^https?:\/\//i.test(url)) return NextResponse.json({ error: 'invalid url scheme' }, { status: 400 })

  // require auth to avoid open proxy abuse
  const debug = req.nextUrl.searchParams.get('debug')
  const isDebugAllowed = debug === '1' && process.env.NODE_ENV !== 'production'
  const debugSession = req.nextUrl.searchParams.get('session')
  const auth = req.headers.get('authorization')
  let authedUserId: string | null = null
  if (!isDebugAllowed) {
    if (!auth || !auth.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'missing Authorization Bearer token' }, { status: 401 })
    }
    const token = auth.split(' ')[1]
    try {
      const u = await supabaseAdmin.auth.getUser(token)
      if (!u?.data?.user) return NextResponse.json({ error: 'invalid token' }, { status: 401 })
      authedUserId = u.data.user.id
    } catch (e) {
      return NextResponse.json({ error: 'invalid token' }, { status: 401 })
    }
  }

  // dynamic import of playwright to avoid startup failure when not installed
  let playwright: any
  try {
    playwright = await import('playwright')
  } catch (e: any) {
    return NextResponse.json({ error: 'playwright not installed. run npm install', detail: String((e as any)?.message ?? e) }, { status: 501 })
  }

  const { chromium } = playwright
  let browser: any = null
  try {
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })

    // If there is a stored playwright session for this authenticated user, load cookies
    try {
      const fs = require('fs')
      const path = require('path')
      // Debug mode: allow specifying a session file to load cookies from (dev only)
      if (isDebugAllowed && debugSession) {
        const cookieFile = path.join(process.cwd(), 'data', 'playwright_sessions', `${debugSession}.json`)
        if (fs.existsSync(cookieFile)) {
          try {
            const { decryptObjectFromFile } = await import('../../../lib/sessionEncryption')
            const cookies = await decryptObjectFromFile(cookieFile)
            if (Array.isArray(cookies) && cookies.length) {
              const normalized = cookies.map((c: any) => {
                const domain = c.domain || (typeof url === 'string' ? new URL(url).hostname : undefined)
                const pathVal = c.path || '/'
                const nc: any = {
                  name: c.name,
                  value: c.value,
                  domain: domain,
                  path: pathVal,
                  httpOnly: !!c.httpOnly,
                  secure: !!c.secure,
                  sameSite: (function(s:any){ if(!s) return undefined; const ss=String(s); if(/lax/i.test(ss)) return 'Lax'; if(/strict/i.test(ss)) return 'Strict'; if(/none/i.test(ss)) return 'None'; return undefined })(c.sameSite),
                  expires: typeof c.expires === 'number' ? c.expires : undefined,
                }
                try { if (domain) nc.url = `https://${domain}` } catch (e) {}
                return nc
              })
              await context.addCookies(normalized)
            }
          } catch (e) {
            try {
              const raw = fs.readFileSync(cookieFile, 'utf-8')
              const cookies = JSON.parse(raw)
              if (Array.isArray(cookies) && cookies.length) {
                const normalized = cookies.map((c: any) => {
                  const domain = c.domain || (typeof url === 'string' ? new URL(url).hostname : undefined)
                  const pathVal = c.path || '/'
                  const nc: any = {
                    name: c.name,
                    value: c.value,
                    domain: domain,
                    path: pathVal,
                    httpOnly: !!c.httpOnly,
                    secure: !!c.secure,
                    sameSite: (function(s:any){ if(!s) return undefined; const ss=String(s); if(/lax/i.test(ss)) return 'Lax'; if(/strict/i.test(ss)) return 'Strict'; if(/none/i.test(ss)) return 'None'; return undefined })(c.sameSite),
                    expires: typeof c.expires === 'number' ? c.expires : undefined,
                  }
                  try { if (domain) nc.url = `https://${domain}` } catch (e) {}
                  return nc
                })
                await context.addCookies(normalized)
              }
            } catch (err) {
              // ignore cookie load errors
            }
          }
        }
      }
      // If an Authorization header exists, try the supabase->userId flow as before
      const authHeader = req.headers.get('authorization')
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1]
        try {
          const u = await supabaseAdmin.auth.getUser(token)
          const userId = u?.data?.user?.id
          if (userId) {
            const cookieFile = path.join(process.cwd(), 'data', 'playwright_sessions', `${userId}.json`)
            if (fs.existsSync(cookieFile)) {
              try {
                const { decryptObjectFromFile } = await import('../../../lib/sessionEncryption')
                const cookies = await decryptObjectFromFile(cookieFile)
                if (Array.isArray(cookies) && cookies.length) {
                  const normalized = cookies.map((c: any) => {
                    const domain = c.domain || (typeof url === 'string' ? new URL(url).hostname : undefined)
                    const pathVal = c.path || '/'
                    const nc: any = {
                      name: c.name,
                      value: c.value,
                      domain: domain,
                      path: pathVal,
                      httpOnly: !!c.httpOnly,
                      secure: !!c.secure,
                      sameSite: (function(s:any){ if(!s) return undefined; const ss=String(s); if(/lax/i.test(ss)) return 'Lax'; if(/strict/i.test(ss)) return 'Strict'; if(/none/i.test(ss)) return 'None'; return undefined })(c.sameSite),
                      expires: typeof c.expires === 'number' ? c.expires : undefined,
                    }
                    try { if (domain) nc.url = `https://${domain}` } catch (e) {}
                    return nc
                  })
                  await context.addCookies(normalized)
                }
              } catch (e) {
                try {
                  const raw = fs.readFileSync(cookieFile, 'utf-8')
                  const cookies = JSON.parse(raw)
                  if (Array.isArray(cookies) && cookies.length) {
                    const normalized = cookies.map((c: any) => {
                      const domain = c.domain || (typeof url === 'string' ? new URL(url).hostname : undefined)
                      const pathVal = c.path || '/'
                      const nc: any = {
                        name: c.name,
                        value: c.value,
                        domain: domain,
                        path: pathVal,
                        httpOnly: !!c.httpOnly,
                        secure: !!c.secure,
                        sameSite: (function(s:any){ if(!s) return undefined; const ss=String(s); if(/lax/i.test(ss)) return 'Lax'; if(/strict/i.test(ss)) return 'Strict'; if(/none/i.test(ss)) return 'None'; return undefined })(c.sameSite),
                        expires: typeof c.expires === 'number' ? c.expires : undefined,
                      }
                      try { if (domain) nc.url = `https://${domain}` } catch (e) {}
                      return nc
                    })
                    await context.addCookies(normalized)
                  }
                } catch (err) {
                  // ignore cookie load errors
                }
              }
            }
          }
        } catch (e) {
          // ignore getUser errors
        }
      }
    } catch (e) {
      // ignore
    }
    const page = await context.newPage()
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 })

    // If screenshot mode explicitly requested, return screenshot
    if (mode === 'screenshot') {
      const buffer = await page.screenshot({ fullPage: true })
      return new NextResponse(buffer, { status: 200, headers: { 'Content-Type': 'image/png' } })
    }

    let html = await page.content()

    // calculate absolute proxy base from request headers
    const host = req.headers.get('host') || 'localhost:3001'
    const proto = req.headers.get('x-forwarded-proto') || 'http'
    const proxyBase = `${proto}://${host}`

    // Rewrite all resource URLs to go through absolute proxy URLs
    const proxyToken = authedUserId ? await getOrCreateProxyTokenForUser(authedUserId) : undefined
    html = rewriteHtmlForProxy(html, url, proxyBase, proxyToken)

    // Insert a <base> pointing to the original origin so root-relative
    // URLs resolve to the target site (do this after rewriting resources)
    try {
      const origin = new URL(url).origin
      if (/(<head[^>]*>)/i.test(html)) {
        html = html.replace(/(<head[^>]*>)/i, `$1<base href="${origin}" />`)
      } else {
        html = `<head><base href="${origin}" /></head>` + html
      }
    } catch (e) {
      // ignore
    }

    // Inject a small script into the page that intercepts clicks on proxied links
    // (links with `data-ingestion-href`) and forwards the decoded original URL
    // to the parent window via postMessage. We avoid inline onclick handlers to
    // prevent quoting/parsing issues in srcDoc.
    // Inject a safe script that hides visual duplicates (keeps nodes in DOM)
    // and intercepts clicks on proxied links. Add a URL-specific CSS tweak for
    // known pages that render duplicated headers.
    let extraCss = ''
    try {
      const u = new URL(url)
      // target the specific misiir home page which reproduces duplicate header
      if ((u.hostname || '').includes('misiir.sii.cl') && (u.pathname || '').includes('siihome.cgi')) {
        extraCss = 'body > header:nth-of-type(2), body > nav:nth-of-type(2) { display: none !important; }'
      }
    } catch (e) {
      // ignore
    }

    const clickInterceptor = `
    <style>
    ${extraCss}
    </style>
    <script>
    (function(){
  function findAnchor(el){
    while(el && el.tagName !== 'A') el = el.parentElement;
    return el;
  }
  function handleClick(e){
    try{
      var a = findAnchor(e.target);
      if(!a) return;
      var encoded = a.getAttribute('data-ingestion-href');
      if(!encoded) return;
      e.preventDefault();
      try{ var decoded = decodeURIComponent(encoded); } catch(err){ var decoded = encoded }
      parent.postMessage({type:'ingestion:navigate', href: decoded}, '*');
    }catch(err){}
  }

  function hideDuplicateHeaders(){
    try{
      var selector = 'header, nav, [class*="header"], [id*="header"]';
      var elems = Array.from(document.querySelectorAll(selector));
      var seen = new Map();
      elems.forEach(function(el){
        try{
          var key = el.outerHTML;
          if(seen.has(key)){
            // hide visually but keep in DOM for scripts
            el.style.setProperty('display','none','important');
            el.setAttribute('data-ingestion-hidden','1');
          } else {
            seen.set(key, true);
          }
        }catch(e){}
      });
    }catch(e){}
  }

  var mo;
  try{
    mo = new MutationObserver(function(muts){
      var added = muts.some(function(m){ return m.addedNodes && m.addedNodes.length });
      if(added) setTimeout(hideDuplicateHeaders, 50);
    });
  }catch(e){}

  document.addEventListener('click', handleClick, true);

  // Run on DOMContentLoaded and a couple times later to catch async clones
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(hideDuplicateHeaders, 50);
  } else {
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(hideDuplicateHeaders, 50) });
  }
  setTimeout(hideDuplicateHeaders, 400);
  setTimeout(hideDuplicateHeaders, 1200);

  try{ if(mo) mo.observe(document.body, { childList: true, subtree: true }); } catch(e){}
})();
</script>
    `

    try {
      if (/(<body[^>]*>)/i.test(html)) {
        html = html.replace(/(<body[^>]*>)/i, `$1${clickInterceptor}`)
      } else {
        html = clickInterceptor + html
      }
    } catch (e) {
      // ignore injection errors
    }

    return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html' } })
  } catch (e: any) {
    const msg = String((e as any)?.message ?? e)
    console.error('render error', msg)
    // Detect common network/playwright navigation errors and map to sensible status codes
    if (/ECONNREFUSED|ERR_CONNECTION_REFUSED/i.test(msg)) {
      return NextResponse.json({ error: 'connection_refused', message: msg }, { status: 502 })
    }
    if (/timeout|Navigation timeout|Timed out|ETIMEDOUT/i.test(msg)) {
      return NextResponse.json({ error: 'timeout', message: msg }, { status: 504 })
    }
    return NextResponse.json({ error: 'render_error', message: msg }, { status: 502 })
  } finally {
    try { if (browser) await browser.close() } catch (e) { /* ignore */ }
  }
}
