import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import fs from 'fs'
import path from 'path'

function credsPath(userId: string) {
  return path.join(process.cwd(), 'data', 'credentials', `${userId}.json`)
}

async function ensureDir(dir: string) {
  return fs.promises.mkdir(dir, { recursive: true }).catch(() => {})
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

  try {
    const dir = path.dirname(credsPath(userId))
    await ensureDir(dir)
    try {
      const { encryptObjectToFile } = await import('../../../../lib/sessionEncryption')
      await encryptObjectToFile(credsPath(userId), { url, username, password })
    } catch (e) {
      await fs.promises.writeFile(credsPath(userId), JSON.stringify({ url, username, password }, null, 2), 'utf-8')
    }
    // After saving credentials, attempt an immediate server-side refresh to create cookies
    try {
      const host = process.env.NEXT_PUBLIC_APP_HOST || (req.headers.get('host') || 'localhost:3001')
      const proto = req.headers.get('x-forwarded-proto') || 'http'
      const base = `${proto}://${host}`
      const res = await fetch(`${base}/api/session/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'authorization': `Bearer ${token}` },
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok) {
        return NextResponse.json({ ok: true, refreshed: true, result: j })
      } else {
        return NextResponse.json({ ok: true, refreshed: false, refreshError: j }, { status: 202 })
      }
    } catch (e) {
      return NextResponse.json({ ok: true, refreshed: false, refreshError: String((e as any)?.message ?? e) }, { status: 202 })
    }
  } catch (e) {
    return NextResponse.json({ error: 'failed to save credentials', detail: String((e as any)?.message ?? e) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
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

  const file = credsPath(userId)
  if (!fs.existsSync(file)) return NextResponse.json({ hasCredentials: false })
  return NextResponse.json({ hasCredentials: true })
}
