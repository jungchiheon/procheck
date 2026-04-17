// src/app/api/admin/announcements/[id]/comments/route.ts — 댓글 작성(관리자만)
import { NextResponse } from 'next/server'
import { envClients, getProfile, getUserFromBearer, serviceClient } from '@/app/api/_lib/authSupabase'

export const runtime = 'nodejs'

type Body = { body?: string }
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

    const { id: postId } = await ctx.params
    const json = (await req.json().catch(() => null)) as Body | null
    const text = (json?.body ?? '').trim()
    if (!text) return NextResponse.json({ error: 'body required' }, { status: 400 })

    const { data: post } = await svc.from('staff_announcements').select('id').eq('id', postId).eq('is_active', true).maybeSingle()
    if (!post) return NextResponse.json({ error: 'post not found' }, { status: 404 })

    const { data: row, error } = await svc
      .from('announcement_comments')
      .insert({ post_id: postId, author_id: user.id, body: text })
      .select('id, body, created_at, author_id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      ok: true,
      comment: {
        ...row,
        author_nickname: profile.nickname ?? '관리자',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'error' }, { status: 500 })
  }
}
