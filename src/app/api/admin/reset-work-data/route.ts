import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

/**
 * 직원·관리자(user_profiles, auth)는 유지하고,
 * 근무 저장 데이터만 삭제: staff_payment_logs → staff_work_logs 순.
 * 선택적으로 직원 프로필의 일별 정산 처리 상태(settlement_day_status) 초기화.
 */
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

    const supabaseAnon = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: userData, error: userErr } = await supabaseAnon.auth.getUser(token)
    if (userErr || !userData.user) {
      return NextResponse.json({ error: `invalid session: ${userErr?.message ?? 'no user'}` }, { status: 401 })
    }

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
      return NextResponse.json({ error: `profile lookup failed: ${profErr.message}` }, { status: 500 })
    }
    if (!requesterProfile?.is_active) {
      return NextResponse.json({ error: 'inactive account' }, { status: 403 })
    }
    if (requesterProfile.role !== 'admin') {
      return NextResponse.json({ error: 'admin only' }, { status: 403 })
    }

    const { count: payCountBefore } = await supabaseService
      .from('staff_payment_logs')
      .select('*', { count: 'exact', head: true })

    const { count: workCountBefore } = await supabaseService
      .from('staff_work_logs')
      .select('*', { count: 'exact', head: true })

    const { error: payDelErr } = await supabaseService.from('staff_payment_logs').delete().gte('id', 0)
    if (payDelErr) {
      return NextResponse.json({ error: `staff_payment_logs 삭제 실패: ${payDelErr.message}` }, { status: 500 })
    }

    const { error: workDelErr } = await supabaseService.from('staff_work_logs').delete().gte('id', 0)
    if (workDelErr) {
      return NextResponse.json({ error: `staff_work_logs 삭제 실패: ${workDelErr.message}` }, { status: 500 })
    }

    let settlementCleared = false
    const { error: settleErr } = await supabaseService
      .from('user_profiles')
      .update({ settlement_day_status: null })
      .eq('role', 'staff')

    if (!settleErr) {
      settlementCleared = true
    }

    return NextResponse.json({
      ok: true,
      deleted: {
        payments: payCountBefore ?? 0,
        workLogs: workCountBefore ?? 0,
      },
      settlementDayStatusCleared: settlementCleared,
      settlementDayStatusNote: settleErr
        ? `settlement_day_status 초기화 생략: ${settleErr.message}`
        : undefined,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
