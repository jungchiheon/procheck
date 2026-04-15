import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

/**
 * 관리자 계정은 유지하고, 직원 데이터는 전부 초기화:
 * - staff_payment_logs / staff_work_logs 삭제
 * - notifications(직원 호출 등) 삭제
 * - 직원 user_profiles 삭제
 * - 직원 auth user 삭제
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

    const { data: staffProfiles, error: staffListErr } = await supabaseService
      .from('user_profiles')
      .select('id')
      .eq('role', 'staff')
    if (staffListErr) {
      return NextResponse.json({ error: `직원 목록 조회 실패: ${staffListErr.message}` }, { status: 500 })
    }
    const staffIds = (Array.isArray(staffProfiles) ? staffProfiles : [])
      .map((r) => String((r as { id?: string }).id ?? ''))
      .filter(Boolean)

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

    let notiDeleted = 0
    if (staffIds.length) {
      const { count: notiCountBefore } = await supabaseService
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .in('staff_id', staffIds)
      const { error: notiDelErr } = await supabaseService.from('notifications').delete().in('staff_id', staffIds)
      if (notiDelErr) {
        return NextResponse.json({ error: `notifications 삭제 실패: ${notiDelErr.message}` }, { status: 500 })
      }
      notiDeleted = notiCountBefore ?? 0
    }

    let profileDeleted = 0
    if (staffIds.length) {
      const { error: profileDelErr } = await supabaseService.from('user_profiles').delete().in('id', staffIds)
      if (profileDelErr) {
        return NextResponse.json({ error: `직원 프로필 삭제 실패: ${profileDelErr.message}` }, { status: 500 })
      }
      profileDeleted = staffIds.length
    }

    let authDeleted = 0
    const authDeleteErrors: string[] = []
    for (const uid of staffIds) {
      const { error: authErr } = await supabaseService.auth.admin.deleteUser(uid)
      if (authErr) {
        authDeleteErrors.push(`${uid}: ${authErr.message}`)
      } else {
        authDeleted += 1
      }
    }

    return NextResponse.json({
      ok: true,
      deleted: {
        payments: payCountBefore ?? 0,
        workLogs: workCountBefore ?? 0,
        notifications: notiDeleted,
        staffProfiles: profileDeleted,
        staffAuthUsers: authDeleted,
      },
      authDeleteErrors: authDeleteErrors.length ? authDeleteErrors : undefined,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
