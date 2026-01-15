// src/app/api/chat/get-room/route.ts
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
    const partnerId = String(body?.partnerId ?? '')
    if (!partnerId) return NextResponse.json({ error: 'missing partnerId' }, { status: 400 })

    // 1) token 검증
    const supabaseAnon = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: u, error: uErr } = await supabaseAnon.auth.getUser(token)
    if (uErr || !u.user) return NextResponse.json({ error: 'invalid session' }, { status: 401 })
    const uid = u.user.id
    if (uid === partnerId) return NextResponse.json({ error: 'cannot chat with self' }, { status: 400 })

    // 2) service client
    const supabase = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })

    // 3) partner 존재/활성 체크(선택이지만 안전)
    const { data: p, error: pErr } = await supabase
      .from('user_profiles')
      .select('id, is_active')
      .eq('id', partnerId)
      .maybeSingle()

    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
    if (!p || !p.is_active) return NextResponse.json({ error: 'partner not found/inactive' }, { status: 404 })

    // 4) user1/user2 정렬(유니크 제약 맞추기)
    const [user1, user2] = [uid, partnerId].sort()

    // 5) 기존 room 조회
    const { data: existed, error: eErr } = await supabase
      .from('chat_rooms')
      .select('id')
      .eq('user1', user1)
      .eq('user2', user2)
      .maybeSingle()

    if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 })

    let roomId = existed?.id as number | undefined

    // 6) 없으면 생성
    if (!roomId) {
      const { data: created, error: cErr } = await supabase
        .from('chat_rooms')
        .insert({ user1, user2 })
        .select('id')
        .single()

      if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })
      roomId = created.id
    }

    // 7) chat_reads 2명 upsert (안 읽음 계산용)
    await supabase.from('chat_reads').upsert(
      [
        { room_id: roomId, user_id: uid, last_read_at: null },
        { room_id: roomId, user_id: partnerId, last_read_at: null },
      ],
      { onConflict: 'room_id,user_id' }
    )

    return NextResponse.json({ roomId })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'unexpected error' }, { status: 500 })
  }
}
