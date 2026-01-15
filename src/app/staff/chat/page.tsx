'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabaseClient'
import { GlassCard } from '@/components/ui/GlassCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { cn } from '@/lib/cn'

type UserRow = { id: string; nickname: string | null; login_id: string | null; is_active: boolean }
type RoomRow = { id: number; user1: string; user2: string; last_message_at: string | null; last_message_text: string | null }
type UnreadRow = { room_id: number | string; unread_count: number | string | null }

export default function StaffChatListPage() {
  const router = useRouter()

  const [me, setMe] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<UserRow[]>([])
  const [rooms, setRooms] = useState<RoomRow[]>([])
  const [unreadMap, setUnreadMap] = useState<Record<number, number>>({})

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const { data: u } = await supabaseClient.auth.getUser()
        const uid = u.user?.id
        if (!uid) {
          router.replace('/login')
          return
        }
        setMe(uid)

        // partner list (API: staff면 admin 목록)
        const { data: s } = await supabaseClient.auth.getSession()
        const token = s.session?.access_token
        if (!token) {
          router.replace('/login')
          return
        }

        const pres = await fetch('/api/chat/list-partners', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        })
        const pjson = await pres.json().catch(() => ({}))
        if (!pres.ok) throw new Error(pjson?.error || '파트너 목록 로드 실패')
        setUsers((pjson.items ?? []) as UserRow[])

        // 내 rooms
        const { data: r, error: rErr } = await supabaseClient
          .from('chat_rooms')
          .select('id,user1,user2,last_message_at,last_message_text')
          .or(`user1.eq.${uid},user2.eq.${uid}`)

        if (rErr) throw new Error(rErr.message)
        setRooms((r ?? []) as RoomRow[])

        // unread per room
        const { data: uc, error: ucErr } = await supabaseClient.rpc('get_chat_unread_counts', { p_uid: uid })
        if (ucErr) throw new Error(ucErr.message)

        const rows: UnreadRow[] = Array.isArray(uc) ? (uc as UnreadRow[]) : []
        const map: Record<number, number> = {}
        for (const row of rows) {
          const rid = Number(row.room_id)
          map[rid] = Number(row.unread_count ?? 0)
        }
        setUnreadMap(map)
      } catch (e: any) {
        setError(e?.message ?? '오류')
      } finally {
        setLoading(false)
      }
    })()
  }, [router])

  const roomByOther = useMemo(() => {
    if (!me) return {}
    const m: Record<string, RoomRow> = {}
    for (const r of rooms) {
      const other = r.user1 === me ? r.user2 : r.user1
      m[other] = r
    }
    return m
  }, [rooms, me])

  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q) return users

    if (isSingleChosung(q)) {
      return users.filter((u) => getLeadingHangulChosung(u.nickname ?? u.login_id ?? '') === q)
    }

    const qLower = q.toLowerCase()
    return users.filter((u) => (u.nickname ?? u.login_id ?? '').toLowerCase().includes(qLower))
  }, [users, query])

  return (
    <div className="space-y-6">
      <PageHeader title="1:1 채팅" subtitle="관리자 선택" backHref="/staff" />

      <GlassCard className="p-4">
        <input
          className="w-full rounded-xl border border-white/12 bg-black/20 px-3 py-2.5 text-white outline-none placeholder:text-white/30 focus:border-white/25"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="초성 검색: ㄱ, ㄴ ... / 이름 검색"
          autoComplete="off"
        />
      </GlassCard>

      {loading && (
        <GlassCard className="p-6">
          <div className="text-sm text-white/60">Loading...</div>
        </GlassCard>
      )}

      {error && (
        <GlassCard className="p-6">
          <div className="text-sm text-red-200">{error}</div>
        </GlassCard>
      )}

      {!loading && !error && (
        <GlassCard className="p-2">
          <div className="divide-y divide-white/10">
            {filtered.length === 0 && <div className="py-10 text-sm text-white/60 text-center">관리자가 없습니다.</div>}

            {filtered.map((u) => {
              const room = roomByOther[u.id]
              const unread = room ? (unreadMap[room.id] ?? 0) : 0
              const last = room?.last_message_text ?? ''
              const lastAt = room?.last_message_at ? toHHMM(room.last_message_at) : ''

              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => router.push(`/staff/chat/${u.id}`)}
                  className={cn('w-full text-left px-4 py-4 hover:bg-white/5 transition')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-white font-semibold truncate">{u.nickname ?? u.login_id ?? '관리자'}</div>
                      <div className="mt-1 text-xs text-white/45 truncate">{last || '대화 없음'}</div>
                    </div>

                    <div className="shrink-0 flex flex-col items-end gap-2">
                      <div className="text-[11px] text-white/45">{lastAt}</div>

                      {unread > 0 && (
                        <div className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[11px] flex items-center justify-center">
                          {unread > 99 ? '99+' : unread}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </GlassCard>
      )}
    </div>
  )
}

/* 초성 유틸 */
const CHOSUNG = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ']
function isSingleChosung(q: string) { return q.length === 1 && CHOSUNG.includes(q) }
function getChosung(ch: string) {
  const code = ch.charCodeAt(0)
  if (code < 0xac00 || code > 0xd7a3) return null
  const index = Math.floor((code - 0xac00) / 588)
  return CHOSUNG[index] ?? null
}
function getLeadingHangulChosung(name: string) {
  for (const ch of name) {
    const c = getChosung(ch)
    if (c) return c
  }
  return null
}
function toHHMM(iso: string) {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}
