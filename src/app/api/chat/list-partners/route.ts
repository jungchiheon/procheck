// 지금안씀
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url) return NextResponse.json({ error: 'missing NEXT_PUBLIC_SUPABASE_URL' }, { status: 500 })
    if (!anon) return NextResponse.json({ error: 'missing NEXT_PUBLIC_SUPABASE_ANON_KEY' }, { status: 500 })
    if (!service) return NextResponse.json({ error: 'missing SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })

    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) return NextResponse.json({ error: 'missing bearer token' }, { status: 401 })

    // 1) 토큰 검증 (anon)
    const supabaseAnon = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: userData, error: userErr } = await supabaseAnon.auth.getUser(token)
    if (userErr || !userData.user) {
      return NextResponse.json({ error: `invalid session: ${userErr?.message ?? 'no user'}` }, { status: 401 })
    }
    const uid = userData.user.id

    // 2) service role
    const supabaseService = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })

    // 3) 내 role 확인
    const { data: me, error: meErr } = await supabaseService
      .from('user_profiles')
      .select('id, role, is_active')
      .eq('id', uid)
      .maybeSingle()

    if (meErr) return NextResponse.json({ error: meErr.message }, { status: 500 })
    if (!me || !me.is_active) return NextResponse.json({ error: 'inactive or missing profile' }, { status: 403 })

    const targetRole = me.role === 'admin' ? 'staff' : 'admin'

    // 4) 목록
    const { data: list, error: lErr } = await supabaseService
      .from('user_profiles')
      .select('id, nickname, login_id, is_active')
      .eq('role', targetRole)
      .eq('is_active', true)
      .order('nickname', { ascending: true })

    if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 })

    return NextResponse.json({ items: list ?? [] })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'unexpected error' }, { status: 500 })
  }
}
