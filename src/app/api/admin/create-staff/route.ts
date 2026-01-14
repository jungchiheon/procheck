// src/app/api/admin/create-staff/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// 1-1) 런타임 고정(서버에서만 실행)
export const runtime = 'nodejs'

type Body = {
  loginId: string
  password: string
  nickname: string
}

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

    // 1-4) 토큰으로 유저 확인(anon client로 검증)
    const supabaseAnon = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: userData, error: userErr } = await supabaseAnon.auth.getUser(token)
    if (userErr || !userData.user) {
      return NextResponse.json({ error: `1-4) invalid session: ${userErr?.message ?? 'no user'}` }, { status: 401 })
    }

    // 1-5) admin 권한 확인(user_profiles)
    const requesterId = userData.user.id

    const supabaseService = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: requesterProfile, error: profErr } = await supabaseService
      .from('user_profiles')
      .select('id, role, is_active')
      .eq('id', requesterId)
      .maybeSingle()

    if (profErr) {
      return NextResponse.json({ error: `1-5) profile lookup failed: ${profErr.message}` }, { status: 500 })
    }
    if (!requesterProfile) {
      return NextResponse.json({ error: '1-5) profile not found' }, { status: 403 })
    }
    if (!requesterProfile.is_active) {
      return NextResponse.json({ error: '1-5) inactive admin' }, { status: 403 })
    }
    if (requesterProfile.role !== 'admin') {
      return NextResponse.json({ error: '1-5) admin only' }, { status: 403 })
    }

    // 1-6) body 파싱
    const body = (await req.json().catch(() => null)) as Body | null
    if (!body) return NextResponse.json({ error: '1-6) invalid json body' }, { status: 400 })

    const loginId = (body.loginId || '').trim()
    const password = body.password || ''
    const nickname = (body.nickname || '').trim()

    if (!loginId) return NextResponse.json({ error: '1-6) loginId required' }, { status: 400 })
    if (!password) return NextResponse.json({ error: '1-6) password required' }, { status: 400 })
    if (!nickname) return NextResponse.json({ error: '1-6) nickname required' }, { status: 400 })

    // 1-7) loginId 안전 필터(원하면 규칙 완화 가능)
    const normalized = loginId.toLowerCase()
    if (!/^[a-z0-9_-]{3,20}$/.test(normalized)) {
      return NextResponse.json({ error: '1-7) loginId는 3~20자 영문/숫자/_/- 만 허용' }, { status: 400 })
    }

    // 1-8) 내부 이메일 매핑(staff)
    const email = `${normalized}@staff.internal`

    // 1-9) 중복 login_id 사전 체크(친절한 에러)
    const { data: dup, error: dupErr } = await supabaseService
      .from('user_profiles')
      .select('id')
      .eq('login_id', normalized)
      .maybeSingle()

    if (dupErr) {
      return NextResponse.json({ error: `1-9) duplicate check failed: ${dupErr.message}` }, { status: 500 })
    }
    if (dup?.id) {
      return NextResponse.json({ error: '1-9) 이미 존재하는 loginId 입니다.' }, { status: 409 })
    }

    // 1-10) Auth 유저 생성(관리자 API)
    const { data: created, error: createErr } = await supabaseService.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // 1-10-1) 내부 이메일이므로 confirm 처리
    })

    if (createErr || !created.user) {
      return NextResponse.json({ error: `1-10) auth create failed: ${createErr?.message ?? 'no user'}` }, { status: 400 })
    }

    const newUserId = created.user.id

    // 1-11) user_profiles 생성
    const { error: insErr } = await supabaseService.from('user_profiles').insert({
      id: newUserId,
      login_id: normalized,
      nickname,
      role: 'staff',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    if (insErr) {
      // 1-11-1) 프로필 insert 실패 시 Auth 유저 롤백(정리)
      await supabaseService.auth.admin.deleteUser(newUserId).catch(() => null)
      return NextResponse.json({ error: `1-11) profile insert failed: ${insErr.message}` }, { status: 500 })
    }

    // 1-12) 성공 응답
    return NextResponse.json({
      ok: true,
      staff: { id: newUserId, login_id: normalized, nickname, role: 'staff' },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'unexpected error' }, { status: 500 })
  }
}
