import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import fs from 'fs'
import path from 'path'

function cookieStorePath(userId: string) {
  return path.join(process.cwd(), 'data', 'playwright_sessions', `${userId}.json`)
}

export async function POST(req: NextRequest) {
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

  try {
    const file = cookieStorePath(userId)
    if (fs.existsSync(file)) {
      fs.unlinkSync(file)
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: 'failed to clear session', detail: String((e as any)?.message ?? e) }, { status: 500 })
  }
}
