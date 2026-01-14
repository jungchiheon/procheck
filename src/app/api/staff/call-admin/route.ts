// src/app/api/staff/call-admin/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// 1-1) 서버 런타임 고정
export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    // 1-2) ENV 체크
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url) return NextResponse.json({ error: '1-2) missing NEXT_PUBLIC_SUPABASE_URL' }, { status: 500 })
    if (!anon) return NextResponse.json({ error: '1-2) missing NEXT_PUBLIC_SUPABASE_ANON_KEY' }, { status: 500 })
    if (!service) return NextResponse.json({ error: '1-2) missing SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })

    // 1-3) Authorization: Bearer <token>
    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) return NextResponse.json({ error: '1-3) missing bearer token' }, { status: 401 })

    // 1-4) 토큰 유효성 확인(anon client)
    const supabaseAnon = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: userData, error: userErr } = await supabaseAnon.auth.getUser(token)
    if (userErr || !userData.user) {
      return NextResponse.json(
        { error: `1-4) invalid session: ${userErr?.message ?? 'no user'}` },
        { status: 401 }
      )
    }

    const uid = userData.user.id

    // 1-5) service role client (DB 조회/insert는 service로 처리)
    const supabaseService = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // 1-6) user_profiles로 staff 여부/활성 여부 확인
    const { data: profile, error: pErr } = await supabaseService
      .from('user_profiles')
      .select('id, login_id, nickname, role, is_active')
      .eq('id', uid)
      .maybeSingle()

    if (pErr) {
      return NextResponse.json({ error: `1-6) profile lookup failed: ${pErr.message}` }, { status: 500 })
    }
    if (!profile) return NextResponse.json({ error: '1-6) profile not found' }, { status: 403 })
    if (!profile.is_active) return NextResponse.json({ error: '1-6) inactive user' }, { status: 403 })
    if (profile.role !== 'staff') return NextResponse.json({ error: '1-6) staff only' }, { status: 403 })

    // 1-7) notifications insert
    //      admin_id = null => "모든 관리자 대상"으로 해석
    const message = `${profile.nickname ?? profile.login_id} 호출`

    const { error: insErr } = await supabaseService.from('notifications').insert({
      type: 'call',
      staff_id: uid,
      admin_id: null,
      message,
      is_read: false,
      created_at: new Date().toISOString(),
    })

    if (insErr) {
      return NextResponse.json({ error: `1-7) insert failed: ${insErr.message}` }, { status: 500 })
    }

    // 1-8) 성공
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'unexpected error' }, { status: 500 })
  }
}
