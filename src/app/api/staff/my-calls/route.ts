// src/app/api/staff/my-calls/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !anon || !service) {
      return NextResponse.json({ error: 'server config' }, { status: 500 })
    }

    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) return NextResponse.json({ error: 'missing bearer token' }, { status: 401 })

    const supabaseAnon = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: userData, error: userErr } = await supabaseAnon.auth.getUser(token)
    if (userErr || !userData.user) {
      return NextResponse.json({ error: 'invalid session' }, { status: 401 })
    }

    const uid = userData.user.id

    const supabaseService = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: profile, error: pErr } = await supabaseService
      .from('user_profiles')
      .select('id, role, is_active')
      .eq('id', uid)
      .maybeSingle()

    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
    if (!profile?.is_active || profile.role !== 'staff') {
      return NextResponse.json({ error: 'staff only' }, { status: 403 })
    }

    const { data, error } = await supabaseService
      .from('notifications')
      .select('id, message, created_at, status, approved_minutes, approved_at, approved_by, is_read')
      .eq('type', 'call')
      .eq('staff_id', uid)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ items: data ?? [] })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'error' }, { status: 500 })
  }
}
