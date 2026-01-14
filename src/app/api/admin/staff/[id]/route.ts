// src/app/api/admin/staff/[id]/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> } // 1-1) params가 Promise로 들어오는 케이스 대응
) {
  try {
    // 1-2) params unwrap (중요)
    const { id: staffId } = await context.params
    if (!staffId) return NextResponse.json({ error: '1-2) missing id' }, { status: 400 })

    // 1-3) 토큰 추출(관리자 인증)
    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return NextResponse.json({ error: '1-3) missing token' }, { status: 401 })

    // 1-4) anon + token으로 호출자(user) 확인
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anonKey) throw new Error('1-4) supabase env missing')

    const supabaseAuth = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })

    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser()
    if (userErr || !userData.user) {
      return NextResponse.json({ error: '1-4) invalid session' }, { status: 401 })
    }

    // 1-5) 서비스키 클라이언트
    const admin = createSupabaseAdmin()

    // 1-6) 호출자가 admin인지 확인
    const { data: callerProfile, error: callerErr } = await admin
      .from('user_profiles')
      .select('id, role, is_active')
      .eq('id', userData.user.id)
      .maybeSingle()

    if (
      callerErr ||
      !callerProfile ||
      callerProfile.role !== 'admin' ||
      callerProfile.is_active !== true
    ) {
      return NextResponse.json({ error: '1-6) not admin' }, { status: 403 })
    }

    // 1-7) 직원 프로필 조회
    const { data: staff, error: staffErr } = await admin
      .from('user_profiles')
      .select(
        'id, login_id, nickname, role, is_active, last_checkin_at, last_checkout_at, bank_name, bank_account, bank_holder'
      )
      .eq('id', staffId)
      .maybeSingle()

    if (staffErr) throw new Error(`1-7) staff query failed: ${staffErr.message}`)
    if (!staff) return NextResponse.json({ error: '1-7) staff not found' }, { status: 404 })

    return NextResponse.json({ staff })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? '1-0) server error' }, { status: 500 })
  }
}
