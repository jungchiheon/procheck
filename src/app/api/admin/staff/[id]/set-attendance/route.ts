// src/app/api/admin/staff/[id]/set-attendance/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function isValidIsoOrNull(v: any) {
  if (v === null || v === undefined) return true
  if (typeof v !== 'string') return false
  const t = Date.parse(v)
  return Number.isFinite(t)
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  try {
    const staffId = ctx.params.id

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url) return NextResponse.json({ error: 'missing NEXT_PUBLIC_SUPABASE_URL' }, { status: 500 })
    if (!anon) return NextResponse.json({ error: 'missing NEXT_PUBLIC_SUPABASE_ANON_KEY' }, { status: 500 })
    if (!service) return NextResponse.json({ error: 'missing SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })

    // Authorization: Bearer <token>
    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) return NextResponse.json({ error: 'missing bearer token' }, { status: 401 })

    // 1) 토큰 검증(anon)
    const supabaseAnon = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: userData, error: userErr } = await supabaseAnon.auth.getUser(token)
    if (userErr || !userData.user) {
      return NextResponse.json({ error: `invalid session: ${userErr?.message ?? 'no user'}` }, { status: 401 })
    }
    const uid = userData.user.id

    // 2) service role
    const supabaseService = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })

    // 3) 요청자(admin) 체크
    const { data: me, error: meErr } = await supabaseService
      .from('user_profiles')
      .select('id, role, is_active')
      .eq('id', uid)
      .maybeSingle()

    if (meErr) return NextResponse.json({ error: meErr.message }, { status: 500 })
    if (!me || !me.is_active || me.role !== 'admin') {
      return NextResponse.json({ error: 'admin only' }, { status: 403 })
    }

    // 4) body
    const body = await req.json().catch(() => ({}))
    const last_checkin_at = body?.last_checkin_at ?? null
    const last_checkout_at = body?.last_checkout_at ?? null

    if (!isValidIsoOrNull(last_checkin_at)) {
      return NextResponse.json({ error: 'invalid last_checkin_at' }, { status: 400 })
    }
    if (!isValidIsoOrNull(last_checkout_at)) {
      return NextResponse.json({ error: 'invalid last_checkout_at' }, { status: 400 })
    }

    if (last_checkin_at && last_checkout_at) {
      if (new Date(last_checkin_at) > new Date(last_checkout_at)) {
        return NextResponse.json({ error: '퇴근 시간이 출근 시간보다 빠릅니다.' }, { status: 400 })
      }
    }

    // 5) 대상 staff 존재 확인(선택: staff만 허용)
    const { data: target, error: tErr } = await supabaseService
      .from('user_profiles')
      .select('id, role')
      .eq('id', staffId)
      .maybeSingle()

    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 })
    if (!target) return NextResponse.json({ error: 'target not found' }, { status: 404 })
    if (target.role !== 'staff') return NextResponse.json({ error: 'target is not staff' }, { status: 400 })

    // 6) 업데이트
    const { data: updated, error: uErr } = await supabaseService
      .from('user_profiles')
      .update({
        last_checkin_at: last_checkin_at,
        last_checkout_at: last_checkout_at,
      })
      .eq('id', staffId)
      .select('id,last_checkin_at,last_checkout_at')
      .maybeSingle()

    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })
    if (!updated) return NextResponse.json({ error: 'update failed' }, { status: 500 })

    return NextResponse.json({ ok: true, staff: updated })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'unexpected error' }, { status: 500 })
  }
}
