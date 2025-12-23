import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import fs from 'fs'
import path from 'path'

function cookieStorePath(userId: string) {
  return path.join(process.cwd(), 'data', 'playwright_sessions', `${userId}.json`)
}

export async function GET(req: NextRequest) {
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
    const exists = fs.existsSync(file)
    if (!exists) {
      return NextResponse.json({ hasCookies: false })
    }
    try {
      const { decryptObjectFromFile } = await import('../../../../lib/sessionEncryption')
      const cookies = await decryptObjectFromFile(file)
      if (cookies && Array.isArray(cookies)) {
        return NextResponse.json({ hasCookies: cookies.length > 0, count: cookies.length })
      }
      return NextResponse.json({ hasCookies: false })
    } catch (e) {
      // fallback plaintext
      const raw = fs.readFileSync(file, 'utf-8')
      const cookies = JSON.parse(raw)
      return NextResponse.json({ hasCookies: Array.isArray(cookies) && cookies.length > 0, count: cookies.length })
    }
  } catch (e) {
    return NextResponse.json({ hasCookies: false })
  }
}
