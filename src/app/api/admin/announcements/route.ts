// src/app/api/admin/announcements/route.ts — 목록 + 글 등록
import { NextResponse } from 'next/server'
import { envClients, getProfile, getUserFromBearer, serviceClient } from '@/app/api/_lib/authSupabase'

export const runtime = 'nodejs'

const PAGE_SIZE = 10

type Body = { title?: string; body?: string }

export async function GET(req: Request) {
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

    const { searchParams } = new URL(req.url)
    const pageRaw = Number(searchParams.get('page') ?? '1')
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const { count: total, error: cErr } = await svc
      .from('staff_announcements')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)

    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

    const totalCount = total ?? 0
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

    const { data: posts, error } = await svc
      .from('staff_announcements')
      .select('id, title, created_at, view_count')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const rows = posts ?? []
    const ids = rows.map((r) => r.id as string)
    const countMap = new Map<string, number>()
    if (ids.length) {
      const { data: cc } = await svc.from('announcement_comments').select('post_id').in('post_id', ids)
      for (const r of cc ?? []) {
        const pid = (r as { post_id: string }).post_id
        countMap.set(pid, (countMap.get(pid) ?? 0) + 1)
      }
    }

    const items = rows.map((r) => ({
      id: r.id,
      title: r.title,
      created_at: r.created_at,
      view_count: Number((r as { view_count?: number }).view_count ?? 0),
      comment_count: countMap.get(r.id as string) ?? 0,
    }))

    return NextResponse.json({
      items,
      page,
      pageSize: PAGE_SIZE,
      total: totalCount,
      totalPages,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
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

    const body = (await req.json().catch(() => null)) as Body | null
    const title = (body?.title ?? '').trim()
    const text = (body?.body ?? '').trim()
    if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 })

    const { data, error } = await svc
      .from('staff_announcements')
      .insert({
        title,
        body: text,
        created_by: user.id,
        is_active: true,
        view_count: 0,
      })
      .select('id, title, body, created_at, view_count')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, item: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'error' }, { status: 500 })
  }
}
