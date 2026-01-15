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

    const body = await req.json().catch(() => ({}))
    const partnerId = String(body?.partnerId ?? '').trim()
    if (!partnerId) return NextResponse.json({ error: 'missing partnerId' }, { status: 400 })

    // 1) 토큰 검증(anon)
    const supabaseAnon = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: u, error: uErr } = await supabaseAnon.auth.getUser(token)
    if (uErr || !u.user) {
      return NextResponse.json({ error: `invalid session: ${uErr?.message ?? 'no user'}` }, { status: 401 })
    }

    // 2) service role로 partner profile 읽기(RLS 우회)
    const supabaseService = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: p, error: pErr } = await supabaseService
      .from('user_profiles')
      .select('id,nickname,login_id,role,is_active')
      .eq('id', partnerId)
      .maybeSingle()

    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
    if (!p) return NextResponse.json({ error: 'partner not found' }, { status: 404 })
    if (!p.is_active) return NextResponse.json({ error: 'partner inactive' }, { status: 403 })

    return NextResponse.json({
      partner: { id: p.id, nickname: p.nickname, login_id: p.login_id, role: p.role },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'unexpected error' }, { status: 500 })
  }
}
