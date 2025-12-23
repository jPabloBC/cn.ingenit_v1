import { NextResponse } from 'next/server'
import supabaseAdmin from '../../../lib/supabaseAdmin'

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token)
    if (userErr || !userData?.user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    const body = await request.json()
    const tenant_id = body?.tenant_id
    if (!tenant_id) return NextResponse.json({ error: 'tenant_id required' }, { status: 400 })

    const { data: memberships, error: memErr } = await supabaseAdmin
      .from('cn_memberships')
      .select('role')
      .eq('user_id', userData.user.id)
      .eq('tenant_id', tenant_id)
      .limit(1)

    if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 })
    if (!memberships || (Array.isArray(memberships) && memberships.length === 0)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data, error } = await supabaseAdmin.rpc('next_folio', { tenant: tenant_id })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ folio: data })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'unknown' }, { status: 500 })
  }
}
