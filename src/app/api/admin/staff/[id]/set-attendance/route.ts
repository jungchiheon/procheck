import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

type Body = {
  last_checkin_at: string | null
  last_checkout_at: string | null
}

function isValidIsoOrNull(v: unknown) {
  if (v === null) return true
  if (typeof v !== 'string') return false
  const d = new Date(v)
  return Number.isFinite(d.getTime())
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: staffId } = await context.params

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url) return NextResponse.json({ error: 'missing NEXT_PUBLIC_SUPABASE_URL' }, { status: 500 })
    if (!anon) return NextResponse.json({ error: 'missing NEXT_PUBLIC_SUPABASE_ANON_KEY' }, { status: 500 })
    if (!service) return NextResponse.json({ error: 'missing SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })

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

    // 3) 관리자 권한 확인
    const { data: me, error: meErr } = await supabaseService
      .from('user_profiles')
      .select('id, role, is_active')
      .eq('id', uid)
      .maybeSingle()

    if (meErr) return NextResponse.json({ error: meErr.message }, { status: 500 })
    if (!me || !me.is_active || me.role !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    // 4) 바디 파싱 + 검증
    const body = (await req.json().catch(() => ({}))) as Partial<Body>
    const ci = body.last_checkin_at ?? null
    const co = body.last_checkout_at ?? null

    if (!isValidIsoOrNull(ci)) return NextResponse.json({ error: 'invalid last_checkin_at' }, { status: 400 })
    if (!isValidIsoOrNull(co)) return NextResponse.json({ error: 'invalid last_checkout_at' }, { status: 400 })
    if (ci && co && new Date(ci) > new Date(co)) {
      return NextResponse.json({ error: 'checkout must be after checkin' }, { status: 400 })
    }

    // 5) 업데이트
    const { data: updated, error: uErr } = await supabaseService
      .from('user_profiles')
      .update({
        last_checkin_at: ci,
        last_checkout_at: co,
      })
      .eq('id', staffId)
      .select('id, last_checkin_at, last_checkout_at')
      .maybeSingle()

    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })
    if (!updated) return NextResponse.json({ error: 'staff not found' }, { status: 404 })

    return NextResponse.json({ ok: true, staff: updated })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'unexpected error' }, { status: 500 })
  }
}
