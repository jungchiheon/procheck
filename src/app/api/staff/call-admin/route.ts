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

    // 1-4) body 파싱(실패해도 진행 가능하게)
    let body: any = null
    try {
      body = await req.json()
    } catch {
      body = null
    }

    // 1-5) 토큰 유효성 확인(anon client)
    const supabaseAnon = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: userData, error: userErr } = await supabaseAnon.auth.getUser(token)
    if (userErr || !userData.user) {
      return NextResponse.json(
        { error: `1-5) invalid session: ${userErr?.message ?? 'no user'}` },
        { status: 401 }
      )
    }

    const uid = userData.user.id

    // 1-6) service role client (DB 조회/insert는 service로 처리)
    const supabaseService = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // 1-7) user_profiles로 staff 여부/활성 여부 확인
    const { data: profile, error: pErr } = await supabaseService
      .from('user_profiles')
      .select('id, login_id, nickname, role, is_active')
      .eq('id', uid)
      .maybeSingle()

    if (pErr) {
      return NextResponse.json({ error: `1-7) profile lookup failed: ${pErr.message}` }, { status: 500 })
    }
    if (!profile) return NextResponse.json({ error: '1-7) profile not found' }, { status: 403 })
    if (!profile.is_active) return NextResponse.json({ error: '1-7) inactive user' }, { status: 403 })
    if (profile.role !== 'staff') return NextResponse.json({ error: '1-7) staff only' }, { status: 403 })

    // 1-8) message 결정(프론트에서 message를 보내면 그걸 우선 사용)
    const defaultMessage = `${profile.nickname ?? profile.login_id} 호출`
    const message =
      typeof body?.message === 'string' && body.message.trim()
        ? body.message.trim()
        : defaultMessage

    // 1-9) notifications insert (승인 기능 기본값 포함)
    //      admin_id = null => "모든 관리자 대상"
    const { error: insErr } = await supabaseService.from('notifications').insert({
      type: 'call',
      staff_id: uid,
      admin_id: null,
      message,
      is_read: false,

      // 1-9-1) 승인 기능 기본값
      status: 'pending',
      approved_minutes: 0,
      approved_at: null,
      approved_by: null,

      // 1-9-2) created_at은 테이블 default(now())면 생략 가능
      created_at: new Date().toISOString(),
    })

    if (insErr) {
      return NextResponse.json({ error: `1-9) insert failed: ${insErr.message}` }, { status: 500 })
    }

    // 1-10) 성공
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'unexpected error' }, { status: 500 })
  }
}
