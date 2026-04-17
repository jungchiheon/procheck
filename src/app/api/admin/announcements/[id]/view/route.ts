import { NextResponse } from 'next/server'
import { envClients, getProfile, getUserFromBearer, serviceClient } from '@/app/api/_lib/authSupabase'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, ctx: Ctx) {
  try {
    const env = envClients()
    if (!env) return NextResponse.json({ error: 'server config' }, { status: 500 })

    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) return NextResponse.json({ error: 'missing bearer token' }, { status: 401 })

    const { user, error: uErr } = await getUserFromBearer(env.url, env.anon, token)
    if (!user) return NextResponse.json({ error: uErr ?? 'invalid session' }, { status: 401 })

    const svc = serviceClient(env.url, env.service)
    const profile = await getProfile(svc, user.id)
    if (!profile?.is_active || profile.role !== 'admin') {
      return NextResponse.json({ error: 'admin only' }, { status: 403 })
    }

    const { id } = await ctx.params
    const { data: post, error: pErr } = await svc
      .from('staff_announcements')
      .select('id, view_count')
      .eq('id', id)
      .eq('is_active', true)
      .maybeSingle()

    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
    if (!post) return NextResponse.json({ error: 'not found' }, { status: 404 })

    const vc = Number((post as { view_count?: number }).view_count ?? 0)
    const next = vc + 1
    const { error: uErr2 } = await svc.from('staff_announcements').update({ view_count: next }).eq('id', id)
    if (uErr2) return NextResponse.json({ error: uErr2.message }, { status: 500 })

    return NextResponse.json({ view_count: next })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'error' }, { status: 500 })
  }
}
