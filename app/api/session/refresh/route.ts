import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import fs from 'fs'
import path from 'path'

function credsPath(userId: string) {
  return path.join(process.cwd(), 'data', 'credentials', `${userId}.json`)
}

export async function POST(req: NextRequest) {
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
  if (!fs.existsSync(file)) return NextResponse.json({ error: 'no_credentials' }, { status: 404 })

  // Load credentials (try decrypt helper)
  let creds: any = null
  try {
    const { decryptObjectFromFile } = await import('../../../../lib/sessionEncryption')
    creds = await decryptObjectFromFile(file)
  } catch (e) {
    try {
      const raw = fs.readFileSync(file, 'utf-8')
      creds = JSON.parse(raw)
    } catch (err) {
      return NextResponse.json({ error: 'failed_load_credentials' }, { status: 500 })
    }
  }

  if (!creds || !creds.username || !creds.password || !creds.url) return NextResponse.json({ error: 'invalid_credentials_file' }, { status: 422 })

  // Call internal login endpoint to perform login and save cookies
  try {
    const host = req.headers.get('host') || 'localhost:3001'
    const proto = req.headers.get('x-forwarded-proto') || 'http'
    const base = `${proto}://${host}`
    const res = await fetch(`${base}/api/session/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'authorization': `Bearer ${token}` },
      body: JSON.stringify({ url: creds.url, username: creds.username, password: creds.password })
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) {
      return NextResponse.json({ error: 'refresh_failed', detail: j }, { status: res.status })
    }
    return NextResponse.json({ ok: true, result: j })
  } catch (e) {
    return NextResponse.json({ error: 'refresh_error', detail: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
}
