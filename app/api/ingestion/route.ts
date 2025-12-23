import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'

export async function POST(req: NextRequest) {
  // validate auth token
  const auth = req.headers.get('authorization')
  if (!auth || !auth.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'missing Authorization Bearer token' }, { status: 401 })
  }
  const token = auth.split(' ')[1]
  try {
    const u = await supabaseAdmin.auth.getUser(token)
    if (!u?.data?.user) return NextResponse.json({ error: 'invalid token' }, { status: 401 })
  } catch (e) {
    return NextResponse.json({ error: 'invalid token' }, { status: 401 })
  }

  // parse multipart/form-data
  // Next.js route handlers don't include a built-in multipart parser; for now accept JSON or raw body
  // This is a skeleton: read the body as text and return a placeholder response.
  try {
    const contentType = req.headers.get('content-type') || ''
    let info: any = { contentType }
    if (contentType.includes('application/json')) {
      const json = await req.json()
      info.body = json
    } else {
      const text = await req.text()
      info.bodyPreview = text?.slice?.(0, 2000) ?? null
    }

    // TODO: enqueue job to worker (e.g., BullMQ) with metadata and file storage reference

    return NextResponse.json({ ok: true, received: info })
  } catch (e) {
    return NextResponse.json({ error: String((e as any)?.message ?? e) }, { status: 500 })
  }
}
