'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabaseClient'
import { GlassCard } from '@/components/ui/GlassCard'
import { cn } from '@/lib/cn'
import { Send, ChevronLeft } from 'lucide-react'

type MsgRow = { id: number; room_id: number; sender_id: string; body: string; created_at: string }
type ProfileRow = { id: string; nickname: string | null; login_id: string | null; role?: string | null }

export default function AdminChatRoomPage() {
  const router = useRouter()
  const params = useParams()
  const partnerId = useMemo(() => {
    const raw = (params as any)?.id
    return Array.isArray(raw) ? raw[0] : String(raw ?? '')
  }, [params])

  const [me, setMe] = useState<string | null>(null)
  const [partner, setPartner] = useState<ProfileRow | null>(null)

  const [roomId, setRoomId] = useState<number | null>(null)
  const [items, setItems] = useState<MsgRow[]>([])
  const [text, setText] = useState('')

  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  const bottomRef = useRef<HTMLDivElement | null>(null)

  const displayName = useMemo(() => {
    const nn = partner?.nickname?.trim()
    if (nn) return nn
    const lid = partner?.login_id?.trim()
    if (lid) return lid
    if (loading) return '불러오는 중...'
    return '직원'
  }, [partner, loading])

  useEffect(() => {
    if (!partnerId) return

    let ch: ReturnType<typeof supabaseClient.channel> | null = null
    let alive = true

    ;(async () => {
      setLoading(true)
      try {
        const { data: u } = await supabaseClient.auth.getUser()
        const uid = u.user?.id
        if (!uid) {
          router.replace('/login')
          return
        }
        if (!alive) return
        setMe(uid)

        const { data: s } = await supabaseClient.auth.getSession()
        const token = s.session?.access_token
        if (!token) {
          router.replace('/login')
          return
        }

        // partner profile (service API)
        const pr = await fetch('/api/chat/partner', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ partnerId }),
        })
        const pj = await pr.json().catch(() => ({}))
        if (pr.ok && pj?.partner) {
          if (!alive) return
          setPartner(pj.partner as ProfileRow)
        }

        // room get/create
        const res = await fetch('/api/chat/get-room', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ partnerId }),
        })

        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error || 'room 생성 실패')

        const rid = Number(json.roomId)
        if (!rid) throw new Error('roomId가 올바르지 않습니다.')
        if (!alive) return
        setRoomId(rid)

        const { data: msgs, error: mErr } = await supabaseClient
          .from('chat_messages')
          .select('id,room_id,sender_id,body,created_at')
          .eq('room_id', rid)
          .order('created_at', { ascending: true })
          .limit(300)

        if (mErr) throw new Error(mErr.message)
        if (!alive) return
        setItems((msgs ?? []) as MsgRow[])

        await supabaseClient.from('chat_reads').upsert(
          { room_id: rid, user_id: uid, last_read_at: new Date().toISOString() },
          { onConflict: 'room_id,user_id' }
        )

        ch = supabaseClient
          .channel(`chat_room_${rid}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${rid}` },
            async (payload) => {
              const row = payload.new as any
              setItems((prev) => {
  const next = row as MsgRow
  if (prev.some((x) => x.id === next.id)) return prev
  return [...prev, next]
})

              await supabaseClient.from('chat_reads').upsert(
                { room_id: rid, user_id: uid, last_read_at: new Date().toISOString() },
                { onConflict: 'room_id,user_id' }
              )
            }
          )
          .subscribe()
      } catch (e) {
        console.error(e)
      } finally {
        if (alive) setLoading(false)
      }
    })()

    return () => {
      alive = false
      if (ch) supabaseClient.removeChannel(ch)
    }
  }, [router, partnerId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [items.length])

  const onSend = async () => {
  if (!roomId || !me) return
  const v = text.trim()
  if (!v) return

  setSending(true)
  try {
    // ✅ 1) DB insert + 방금 저장된 row를 다시 받아오기
    const { data: inserted, error } = await supabaseClient
      .from('chat_messages')
      .insert({
        room_id: roomId,
        sender_id: me,
        body: v,
      })
      .select('id, room_id, sender_id, body, created_at')
      .single()

    if (error) throw error

    // ✅ 2) 즉시 화면 반영 (Realtime이 늦어도 바로 보임)
    if (inserted) {
      setItems((prev) => {
        if (prev.some((x) => x.id === inserted.id)) return prev
        return [...prev, inserted as MsgRow]
      })
    }

    setText('')

    // ✅ 3) 보낸 직후 읽음 갱신(안전)
    await supabaseClient.from('chat_reads').upsert(
      { room_id: roomId, user_id: me, last_read_at: new Date().toISOString() },
      { onConflict: 'room_id,user_id' }
    )
  } finally {
    setSending(false)
  }
}


  return (
    <div className="fixed inset-0 z-10 flex flex-col overflow-hidden p-6">
      <GlassCard className="shrink-0 w-full max-w-none mx-0 p-0 overflow-hidden">
        <div className="relative h-12 flex items-center px-3">
          <button
            type="button"
            onClick={() => router.push('/admin/chat')}
            className="inline-flex items-center gap-1 rounded-xl px-2 py-1.5 text-white/85 hover:bg-white/10 transition"
            aria-label="뒤로가기"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="text-sm">뒤로</span>
          </button>

          <div className="absolute left-1/2 -translate-x-1/2 max-w-[70%] text-center">
            <div className="text-white font-semibold tracking-tight truncate">{displayName}</div>
          </div>
        </div>

        <div className="h-px w-full bg-white/10" />
      </GlassCard>

      <div className="flex-1 min-h-0 mt-3">
        <GlassCard className="h-full w-full max-w-none mx-0 p-0 overflow-hidden">
          <div className="h-full flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
              {loading && <div className="text-sm text-white/60">Loading...</div>}

              {!loading &&
                items.map((m, idx) => {
                  const mine = m.sender_id === me
                  const needDivider = idx === 0 || dayKey(items[idx - 1].created_at) !== dayKey(m.created_at)

                  return (
                    <div key={m.id}>
                      {needDivider && <DateDivider iso={m.created_at} />}

                      <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                        <div className="max-w-[78%]">
                          <div
                            className={cn(
                              'rounded-2xl px-4 py-2 text-sm leading-6 border',
                              mine ? 'bg-white text-zinc-900 border-white/0' : 'bg-white/5 text-white border-white/12'
                            )}
                          >
                            {m.body}
                          </div>
                          <div className={cn('mt-1 text-[11px] text-white/45', mine ? 'text-right' : 'text-left')}>
                            {toHHMM(m.created_at)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}

              <div ref={bottomRef} />
            </div>

            <div className="h-px w-full bg-white/10" />

            <div className="shrink-0 p-3.5 flex items-center gap-2 pb-[max(18px,env(safe-area-inset-bottom))]">
              <input
                className="flex-1 rounded-xl border border-white/12 bg-black/20 px-3 py-2.5 text-white outline-none placeholder:text-white/30 focus:border-white/25"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="메시지 입력..."
                autoComplete="off"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    onSend()
                  }
                }}
              />

              <button
                type="button"
                onClick={onSend}
                disabled={sending || !text.trim()}
                className={cn(
                  'inline-flex items-center justify-center rounded-xl px-4 py-2.5 border transition',
                  'bg-white text-zinc-900 border-white/0 hover:bg-white/90 active:bg-white/80',
                  'disabled:opacity-60 disabled:cursor-not-allowed'
                )}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  )
}

function dayKey(iso: string) {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function DateDivider({ iso }: { iso: string }) {
  const d = new Date(iso)
  const label = d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
  return (
    <div className="py-2 flex items-center gap-3">
      <div className="flex-1 h-px bg-white/12" />
      <div className="text-[12px] text-white/60 px-3 py-1 rounded-full border border-white/10 bg-white/5">
        {label}
      </div>
      <div className="flex-1 h-px bg-white/12" />
    </div>
  )
}

function toHHMM(iso: string) {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}
