import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'

function resolveAbsolute(base: string, relative: string) {
  try {
    return new URL(relative, base).toString()
  } catch (e) {
    return relative
  }
}

function rewriteHtml(html: string, baseUrl: string) {
  // Simple rewrite for href/src/srcset attributes to proxy through /api/proxy?url=
  // This is a best-effort approach and may not cover all cases.
  const attrRegex = /(href|src)=("|')([^"'>]+)("|')/gi
  let rewritten = html.replace(attrRegex, (m, attr, q1, val) => {
    const v = String(val)
    if (v.startsWith('data:') || v.startsWith('mailto:') || v.startsWith('tel:')) return m
    const abs = resolveAbsolute(baseUrl, v)
    const prox = `/api/proxy?url=${encodeURIComponent(abs)}`
    return `${attr}=${q1}${prox}${q1}`
  })

  // Rewrite srcset values (comma separated URLs)
  const srcsetRegex = /srcset=("|')([^"']+)("|')/gi
  rewritten = rewritten.replace(srcsetRegex, (m, q, val) => {
    const parts = String(val).split(',').map(p => p.trim()).map(p => {
      const [urlPart, descriptor] = p.split(/\s+/)
      const abs = resolveAbsolute(baseUrl, urlPart)
      return `/api/proxy?url=${encodeURIComponent(abs)}${descriptor ? ' ' + descriptor : ''}`
    })
    return `srcset=${q}${parts.join(', ')}${q}`
  })

  // Rewrite url() in CSS (both style attributes and <style> tags)
  const urlRegex = /url\((['"']?)([^)'"]+)\1\)/gi
  rewritten = rewritten.replace(urlRegex, (m, q, val) => {
    const v = String(val).trim()
    if (v.startsWith('data:')) return m
    const abs = resolveAbsolute(baseUrl, v)
    const prox = `/api/proxy?url=${encodeURIComponent(abs)}`
    return `url(${q}${prox}${q})`
  })

  return rewritten
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'missing url' }, { status: 400 })
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: 'invalid url scheme' }, { status: 400 })
  }

  // optional auth check (allows only authenticated users to use proxy-render)
  const auth = req.headers.get('authorization')
  if (auth && auth.startsWith('Bearer ')) {
    const token = auth.split(' ')[1]
    try {
      await supabaseAdmin.auth.getUser(token)
    } catch (e) {
      return NextResponse.json({ error: 'invalid token' }, { status: 401 })
    }
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)

    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) {
      // not HTML, just proxy raw
      const body = await res.arrayBuffer()
      return new NextResponse(body, { status: res.status, headers: { 'Content-Type': contentType } })
    }

    const text = await res.text()
    // Inject a small banner and rewrite resource URLs to go through /api/proxy
    const rewritten = rewriteHtml(text, url)

    const banner = '<div style="position:fixed;left:0;right:0;top:0;background:#111;color:#fff;padding:6px;z-index:9999;font-size:12px;opacity:0.9">Contenido proxied por la app</div>'
    // Insert banner after <body> if possible
    const out = rewritten.replace(/<body[^>]*>/i, (m) => `${m}\n${banner}`)

    return new NextResponse(out, { status: 200, headers: { 'Content-Type': 'text/html' } })
  } catch (e) {
    if ((e as any)?.name === 'AbortError') return NextResponse.json({ error: 'request timeout' }, { status: 504 })
    return NextResponse.json({ error: String((e as any)?.message ?? e) }, { status: 502 })
  }
}
