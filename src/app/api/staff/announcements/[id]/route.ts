// src/app/api/staff/announcements/[id]/route.ts — 상세(조회수 증가는 POST …/view)
import { NextResponse } from 'next/server'
import { envClients, getProfile, getUserFromBearer, serviceClient } from '@/app/api/_lib/authSupabase'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const env = envClients()
    if (!env) return NextResponse.json({ error: 'server config' }, { status: 500 })

    const authHeader = _req.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) return NextResponse.json({ error: 'missing bearer token' }, { status: 401 })

    const { user, error: uErr } = await getUserFromBearer(env.url, env.anon, token)
    if (!user) return NextResponse.json({ error: uErr ?? 'invalid session' }, { status: 401 })

    const svc = serviceClient(env.url, env.service)
    const profile = await getProfile(svc, user.id)
    if (!profile?.is_active || profile.role !== 'staff') {
      return NextResponse.json({ error: 'staff only' }, { status: 403 })
    }

    const { id } = await ctx.params

    const { data: post, error: pErr } = await svc
      .from('staff_announcements')
      .select('id, title, body, created_at, view_count')
      .eq('id', id)
      .eq('is_active', true)
      .maybeSingle()

    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
    if (!post) return NextResponse.json({ error: 'not found' }, { status: 404 })

    const { data: rawComments, error: cErr } = await svc
      .from('announcement_comments')
      .select('id, body, created_at, author_id')
      .eq('post_id', id)
      .order('created_at', { ascending: true })

    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

    const authorIds = [...new Set((rawComments ?? []).map((c: { author_id: string }) => c.author_id))]
    const nickMap = new Map<string, string>()
    if (authorIds.length) {
      const { data: profs } = await svc.from('user_profiles').select('id, nickname').in('id', authorIds)
      for (const p of profs ?? []) {
        nickMap.set((p as { id: string }).id, (p as { nickname: string | null }).nickname ?? '')
      }
    }

    const comments = (rawComments ?? []).map((c: { id: string; body: string; created_at: string; author_id: string }) => ({
      id: c.id,
      body: c.body,
      created_at: c.created_at,
      author_nickname: nickMap.get(c.author_id) || '관리자',
    }))

    return NextResponse.json({
      post,
      comments,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'error' }, { status: 500 })
  }
}
