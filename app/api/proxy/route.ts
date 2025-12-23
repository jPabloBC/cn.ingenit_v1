import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { resolveUserIdFromProxyToken } from '../../../lib/proxyToken'

function resolveAbsolute(base: string, relative: string) {
  try {
    return new URL(relative, base).toString()
  } catch (e) {
    return relative
  }
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'missing url' }, { status: 400 })

  // validate scheme
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: 'invalid url scheme, must start with http:// or https://' }, { status: 400 })
  }

  // optional token validation and capture userId for loading server-side cookies
  const auth = req.headers.get('authorization')
  let userId: string | undefined = undefined

  // If the browser can't send Authorization (iframe/srcDoc), allow a short-lived proxy token.
  // This token is minted by /api/render and embedded into rewritten /api/proxy URLs as `pt`.
  const pt = req.nextUrl.searchParams.get('pt')
  if (pt) {
    const resolved = await resolveUserIdFromProxyToken(pt)
    if (resolved) userId = resolved
  }

  if (auth && auth.startsWith('Bearer ')) {
    const token = auth.split(' ')[1]
    try {
      const u = await supabaseAdmin.auth.getUser(token)
      userId = u?.data?.user?.id
    } catch (e) {
      return NextResponse.json({ error: 'invalid token' }, { status: 401 })
    }
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)

    // Build fetch options and include server-side cookies for the authenticated user if available
    const fetchOptions: any = { signal: controller.signal, headers: {} }
    // Skip cookie loading in serverless (Vercel) - cookies only work in local/VM environments
    if (userId && typeof process !== 'undefined' && process.cwd && process.env.NODE_ENV !== 'production') {
      try {
        const fs = require('fs')
        const path = require('path')
        const cookieFile = path.join(process.cwd(), 'data', 'playwright_sessions', `${userId}.json`)
        if (fs.existsSync(cookieFile)) {
          try {
            const { decryptObjectFromFile } = await import('../../../lib/sessionEncryption')
            const cookies = await decryptObjectFromFile(cookieFile)
            if (Array.isArray(cookies) && cookies.length) {
              // select cookies that match the target host
              const targetHost = new URL(url).hostname
              const cookiePairs = cookies.filter((c: any) => {
                const d = (c.domain || '').replace(/^\./, '')
                return d === targetHost || targetHost.endsWith('.' + d) || (!c.domain)
              }).map((c: any) => `${c.name}=${c.value}`)
              if (cookiePairs.length) {
                fetchOptions.headers['cookie'] = cookiePairs.join('; ')
              }
            }
          } catch (e) {
            try {
              const raw = require('fs').readFileSync(cookieFile, 'utf-8')
              const cookies = JSON.parse(raw)
              if (Array.isArray(cookies) && cookies.length) {
                const targetHost = new URL(url).hostname
                const cookiePairs = cookies.filter((c: any) => {
                  const d = (c.domain || '').replace(/^\./, '')
                  return d === targetHost || targetHost.endsWith('.' + d) || (!c.domain)
                }).map((c: any) => `${c.name}=${c.value}`)
                if (cookiePairs.length) fetchOptions.headers['cookie'] = cookiePairs.join('; ')
              }
            } catch (err) {
              // ignore cookie load errors
            }
          }
        }
      } catch (e) {
        // ignore cookie assembly errors in serverless
      }
    }

    // Forward client user-agent when present to mimic browser requests
    const ua = req.headers.get('user-agent')
    if (ua) fetchOptions.headers['user-agent'] = ua
    // Prefer an explicit `orig` param (full page URL) when present so we can
    // set a precise Referer that matches the originating page; otherwise fall
    // back to the target origin.
    try {
      const orig = req.nextUrl.searchParams.get('orig')
      if (orig) {
        fetchOptions.headers['referer'] = orig
        try { fetchOptions.headers['origin'] = new URL(orig).origin } catch (e) {}
      } else {
        const origin = new URL(url).origin
        fetchOptions.headers['referer'] = origin
        fetchOptions.headers['origin'] = origin
      }
    } catch (e) {
      // ignore
    }

    const res = await fetch(url, fetchOptions)
    clearTimeout(timeout)

    // Forward status and headers. Copy key response headers from the origin
    const contentType = res.headers.get('content-type') || ''
    const headers: Record<string, string> = {}
    // Copy a whitelist of headers from origin to avoid corrupting binary responses
    const headerWhitelist = new Set([
      'content-type', 'content-encoding', 'content-length', 'cache-control',
      'expires', 'last-modified', 'etag', 'accept-ranges', 'content-disposition',
      'vary', 'pragma'
    ])
    try {
      res.headers.forEach((v, k) => {
        const key = k.toLowerCase()
        if (headerWhitelist.has(key)) headers[k] = v
      })
    } catch (e) {}
    // Ensure at least Content-Type is set
    if (!headers['content-type'] && contentType) headers['Content-Type'] = contentType
    // If still no content-type, derive from URL extension for common binary types
    if (!headers['content-type']) {
      try {
        const m = url.match(/\.([a-z0-9]+)(?:\?|$)/i)
        const ext = m && m[1] ? m[1].toLowerCase() : ''
        const mimeMap: Record<string,string> = {
          'woff2': 'font/woff2',
          'woff': 'font/woff',
          'ttf': 'font/ttf',
          'otf': 'font/otf',
          'eot': 'application/vnd.ms-fontobject',
          'svg': 'image/svg+xml'
        }
        if (ext && mimeMap[ext]) headers['Content-Type'] = mimeMap[ext]
      } catch (e) {}
    }
    // Add CORS headers so sandboxed iframes can load fonts, XHR, etc.
    headers['Access-Control-Allow-Origin'] = '*'
    headers['Access-Control-Allow-Methods'] = 'GET, HEAD, OPTIONS'
    headers['Access-Control-Allow-Headers'] = 'Content-Type'

    // If the response looks like binary (images, fonts, etc.) forward as binary
    // Determine if response should be treated as binary. Check content-type first,
    // then fall back to URL extension if content-type is missing.
    const urlLower = String(url).toLowerCase()
    const looksLikeFontByUrl = urlLower.endsWith('.woff2') || urlLower.endsWith('.woff') || urlLower.endsWith('.ttf') || urlLower.endsWith('.otf')
    const isBinary = /^(image|video|audio|application\/octet-stream|font|application\/x-)/i.test(contentType) || /woff2|woff|font/gi.test(contentType) || looksLikeFontByUrl
    if (isBinary) {
      // Binary asset: stream exact bytes back to client and preserve origin headers
      const buffer = await res.arrayBuffer()
      // If origin provided a content-length, ensure we forward it
      try {
        if (!headers['content-length']) headers['Content-Length'] = String(Buffer.byteLength(Buffer.from(buffer)))
      } catch (e) {}
      return new NextResponse(Buffer.from(buffer), { status: res.status, headers })
    }

    // For other types (html, js, css, json, text) return as text but preserve content-type
    let text = await res.text()

    // If HTML, perform attribute rewrites so resources load through the proxy
    if (contentType.includes('text/html')) {
      try {
        // Inject a comprehensive client-side helper script as the FIRST thing in <head> to intercept
        // fetch/XHR AND dynamically inserted elements (link/script/img) that use root-relative URLs.
        const interceptScript = `
          <script>
          (function(){
            var proxyOrigin = location.origin;
            var targetOrigin = "${new URL(url).origin}";
            
            // Helper to rewrite absolute-root paths to proxy URLs
            function rewriteUrl(u) {
              if(!u) return u;
              if(typeof u !== 'string') return u;
              if(u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('javascript:') || u.startsWith('mailto:')) return u;
              // protocol-relative URLs like //cdn.example.com
              if(u.startsWith('//')) return u;
              if(u.startsWith('/')) {
                var abs = targetOrigin + u;
                return proxyOrigin + '/api/proxy?url=' + encodeURIComponent(abs);
              }
              return u;
            }

            function rewriteSrcset(srcset) {
              try {
                if(!srcset || typeof srcset !== 'string') return srcset;
                var parts = srcset.split(',').map(function(p){ return p.trim(); }).filter(Boolean);
                return parts.map(function(p){
                  var segs = p.split(/\s+/);
                  var u = segs[0];
                  if(!u) return p;
                  var rewritten = rewriteUrl(u);
                  if(rewritten === u) return p;
                  segs[0] = rewritten;
                  return segs.join(' ');
                }).join(', ');
              } catch(e){
                return srcset;
              }
            }

            function rewriteElement(el) {
              try {
                if(!el || !el.tagName) return;
                var tag = (el.tagName || '').toUpperCase();

                if(tag === 'LINK') {
                  var href = el.getAttribute('href');
                  if(href && href.startsWith('/') && !href.startsWith('/api/proxy')) {
                    el.setAttribute('href', rewriteUrl(href));
                  }
                }

                if(tag === 'SCRIPT' || tag === 'IMG' || tag === 'IFRAME' || tag === 'SOURCE') {
                  var src = el.getAttribute('src');
                  if(src && src.startsWith('/') && !src.startsWith('/api/proxy')) {
                    el.setAttribute('src', rewriteUrl(src));
                  }
                }

                // srcset is common on <img> and <source>
                var srcset = el.getAttribute && el.getAttribute('srcset');
                if(srcset) {
                  var rewrittenSet = rewriteSrcset(srcset);
                  if(rewrittenSet && rewrittenSet !== srcset) el.setAttribute('srcset', rewrittenSet);
                }
              } catch(e) {}
            }

            function rewriteTree(node) {
              try {
                if(!node) return;
                if(node.nodeType === 1) {
                  rewriteElement(node);
                  // Query for likely resource-bearing elements
                  if(node.querySelectorAll) {
                    var els = node.querySelectorAll('link[href],script[src],img[src],iframe[src],source[src],img[srcset],source[srcset]');
                    for(var i=0;i<els.length;i++) rewriteElement(els[i]);
                  }
                }
              } catch(e) {}
            }
            
            // Intercept fetch() calls
            var origFetch = window.fetch;
            window.fetch = function(resource, init) {
              var url = resource;
              if(typeof resource === 'object' && resource.url) url = resource.url;
              if(typeof url === 'string' && url.startsWith('/')) {
                url = rewriteUrl(url);
              }
              return origFetch.call(this, url, init);
            };
            
            // Intercept XMLHttpRequest
            var origOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url, async, user, pass) {
              if(typeof url === 'string' && url.startsWith('/')) {
                url = rewriteUrl(url);
              }
              return origOpen.call(this, method, url, async, user, pass);
            };

            // Rewrite dynamically inserted resources (common on SII: scripts that inject CSS/JS with '/responsive/...')
            // Keep this lightweight to avoid hanging pages: no full-document scan, no attribute observing.
            try {
              function observeTarget(root) {
                if(!root) return;
                var mo = new MutationObserver(function(muts){
                  for(var i=0;i<muts.length;i++) {
                    var m = muts[i];
                    if(m.type !== 'childList') continue;
                    for(var j=0;j<m.addedNodes.length;j++) {
                      rewriteTree(m.addedNodes[j]);
                    }
                  }
                });
                mo.observe(root, { childList: true, subtree: true });
              }

              function startObserver() {
                try {
                  // Rewrite only the initial HEAD resources (small set)
                  if(document && document.head && document.head.querySelectorAll) {
                    var initial = document.head.querySelectorAll('link[href],script[src]');
                    for(var i=0;i<initial.length;i++) rewriteElement(initial[i]);
                  }

                  // Observe both head and body for added nodes
                  observeTarget(document.head);
                  observeTarget(document.body);
                } catch(e) {}
              }

              if(document && (document.head || document.body)) {
                // Ensure DOM exists; if body not yet created, retry shortly
                startObserver();
                if(!document.body) setTimeout(startObserver, 0);
              } else {
                setTimeout(startObserver, 0);
              }
            } catch(e) {}
          })();
          </script>`
        
        // inject base so relative URLs resolve to original origin
        const baseTag = `<base href="${new URL(url).origin}">`
        
        // Inject BOTH the interceptor script AND the base tag together in ONE replacement
        text = text.replace(/<head([^>]*)>/i, `<head$1>${interceptScript}${baseTag}`)
        
        // remove CSP meta tags that may block scripts or framing
        text = text.replace(/<meta[^>]*http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '')

        // Rewrite src and href attributes to go through proxy (skip data:, mailto:, javascript: and anchors)
        text = text.replace(/(src|href)=(\"|\')([^\"\'#>]+)(\"|\')/gi, (m, attr, q, val) => {
          try {
            const v = String(val).trim()
            if (!v || v.startsWith('data:') || v.startsWith('mailto:') || v.startsWith('javascript:') || v.startsWith('#')) return m
            // If value starts with /, resolve against the target origin
            let abs: string
            if (v.startsWith('/')) {
              abs = new URL(v, new URL(url).origin).toString()
            } else {
              abs = resolveAbsolute(url, v)
            }
            const prox = `/api/proxy?url=${encodeURIComponent(abs)}`
            return `${attr}=${q}${prox}${q}`
          } catch (e) {
            return m
          }
        })
        // Remove target attributes from links and forms so navigation stays inside iframe
        text = text.replace(/\s+target=("|')(.*?)\1/gi, '')
        // Also remove target attributes in cases without quotes
        text = text.replace(/\s+target=([^\s>]+)/gi, '')
        // Ensure forms don't attempt to escape the frame
        text = text.replace(/<form\b/gi, '<form target="_self"')

        // Inject click interceptor at end of body for navigation through proxy
        const clickScript = `
          <script>
          (function(){
            try{
              document.addEventListener('click', function(e){
                var a = e.target && e.target.closest ? e.target.closest('a') : null;
                if(!a) return;
                var href = a.getAttribute('href') || a.href;
                if(!href) return;
                if(href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('#')) return;
                e.preventDefault();
                try {
                  var u = new URL(href, location.href);
                  var orig = null;
                  if (u.pathname && u.pathname.indexOf('/api/proxy') !== -1 && u.searchParams.get('url')) {
                    orig = decodeURIComponent(u.searchParams.get('url'));
                  }
                  var targetUrl = orig || u.toString();
                  if(window.parent) window.parent.postMessage({type:'proxy-navigate', url: targetUrl}, '*');
                  window.location.href = '/api/proxy?url=' + encodeURIComponent(targetUrl);
                } catch(e) {
                  window.location.href = '/api/proxy?url=' + encodeURIComponent(href);
                }
              }, true);
            } catch(e){}
          })();
          </script>`

        if (/<\/body>/i.test(text)) {
          text = text.replace(/<\/body>/i, clickScript + '</body>')
        } else {
          text = text + clickScript
        }
      } catch (e) {
        // ignore HTML rewrite errors
      }
    }

    // If this is CSS (or looks like CSS), rewrite url(...) and @import to go through the proxy
    const contentLower = (contentType || '').toLowerCase()
    if (contentLower.includes('css') || /\.css(\?|$)/i.test(url)) {
      try {
        const host = req.headers.get('host') || 'localhost:3001'
        const proto = req.headers.get('x-forwarded-proto') || 'http'
        const proxyBase = `${proto}://${host}`
        text = text.replace(/url\((['"]?)([^)'"]+)\1\)/gi, (m, q, v) => {
          try {
            const val = String(v).trim()
            if (val.startsWith('data:')) return m
            // If value starts with /, resolve against the target origin
            let abs: string
            if (val.startsWith('/')) {
              abs = new URL(val, new URL(url).origin).toString()
            } else {
              abs = resolveAbsolute(url, val)
            }
            return `url(${q}${proxyBase}/api/proxy?url=${encodeURIComponent(abs)}${q})`
          } catch (e) {
            return m
          }
        })
        // Rewrite @import '...'; and @import "...";
        text = text.replace(/@import\s+(?:url\()?['"]?([^'"\)]+)['"]?\)?/gi, (m, p1) => {
          try {
            const val = String(p1).trim()
            // If value starts with /, resolve against the target origin
            let abs: string
            if (val.startsWith('/')) {
              abs = new URL(val, new URL(url).origin).toString()
            } else {
              abs = resolveAbsolute(url, val)
            }
            return `@import url(${proxyBase}/api/proxy?url=${encodeURIComponent(abs)})`
          } catch (e) {
            return m
          }
        })
      } catch (e) {
        // ignore rewrite errors
      }
    }

    // Remove content-encoding and content-length headers when returning rewritten text
    for (const k of Object.keys(headers)) {
      const lk = k.toLowerCase()
      if (lk === 'content-encoding' || lk === 'content-length') delete headers[k]
    }
    // Set fresh content-length
    headers['Content-Length'] = String(new TextEncoder().encode(text).length)

    return new NextResponse(text, { status: res.status, headers })
  } catch (e) {
    if ((e as any)?.name === 'AbortError') {
      return NextResponse.json({ error: 'request timeout' }, { status: 504 })
    }
    return NextResponse.json({ error: String((e as any)?.message ?? e) }, { status: 502 })
  }
}
