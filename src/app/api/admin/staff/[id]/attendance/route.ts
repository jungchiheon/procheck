import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type AttendanceStatus = 'working' | 'car_wait' | 'dorm_wait' | 'off'
const ALLOWED: AttendanceStatus[] = ['working', 'car_wait', 'dorm_wait', 'off']

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: staffId } = await params

    const auth = req.headers.get('authorization') || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: 'Missing SUPABASE env vars' },
        { status: 500 }
      )
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    })

    // 1) 토큰 유저 확인
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token)
    if (userErr || !userData.user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // 2) 관리자 권한 확인
    const { data: me, error: meErr } = await supabaseAdmin
      .from('user_profiles')
      .select('role, is_active')
      .eq('id', userData.user.id)
      .maybeSingle()

    if (meErr) return NextResponse.json({ error: meErr.message }, { status: 500 })
    if (!me?.is_active) return NextResponse.json({ error: '비활성 계정' }, { status: 403 })
    if (me.role !== 'admin') return NextResponse.json({ error: '관리자만 가능' }, { status: 403 })

    // 3) 입력값
    const body = await req.json().catch(() => ({}))
    const status = body?.status as AttendanceStatus

    if (!ALLOWED.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    // 4) 업데이트
    const { error: upErr } = await supabaseAdmin
      .from('user_profiles')
      .update({ attendance_status: status })
      .eq('id', staffId)

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

    return NextResponse.json({ ok: true, attendance_status: status })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Server error' }, { status: 500 })
  }
}
