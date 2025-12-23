import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get('url')
    if (!url) return NextResponse.json({ error: 'missing url' }, { status: 400 })

    // Some sites behave differently on HEAD (or omit security headers),
    // so we try HEAD first and fall back to a lightweight GET.
    const readHeaders = (res: Response) => {
      const headers: Record<string, string> = {}
      res.headers.forEach((v, k) => (headers[k.toLowerCase()] = v))
      return headers
    }

    let res = await fetch(url, { method: 'HEAD', redirect: 'follow' })
    let headers = readHeaders(res)

    const hasXfo = typeof headers['x-frame-options'] === 'string' && headers['x-frame-options'].length > 0
    const hasCsp = typeof headers['content-security-policy'] === 'string' && headers['content-security-policy'].length > 0
    if (!hasXfo && !hasCsp) {
      res = await fetch(url, { method: 'GET', redirect: 'follow' })
      headers = readHeaders(res)
      try { res.body?.cancel() } catch (e) {}
    }

    return NextResponse.json({ status: res.status, headers })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 })
  }
}
