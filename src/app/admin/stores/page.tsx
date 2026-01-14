// src/app/admin/stores/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabaseClient'
import { GlassCard } from '@/components/ui/GlassCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { ProButton } from '@/components/ui/ProButton'
import { cn } from '@/lib/cn'
import { Plus, Trash2 } from 'lucide-react'

type StoreRow = {
  id: number
  name: string
  is_active: boolean
  created_at?: string
}

export default function AdminStoresPage() {
  // 1-1) 라우터
  const router = useRouter()

  // 1-2) 상태
  const [loading, setLoading] = useState(true)
  const [stores, setStores] = useState<StoreRow[]>([])
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 1-3) 활성 가게만
  const activeStores = useMemo(
    () => stores.filter((s) => s.is_active).sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [stores]
  )

  // 1-4) 공통: 로그아웃
  const onLogout = async () => {
    await supabaseClient.auth.signOut()
    router.replace('/login')
  }

  // 1-5) 데이터 로드
  const fetchStores = async () => {
    setError(null)
    setMessage(null)
    const { data, error } = await supabaseClient
      .from('stores')
      .select('id, name, is_active, created_at')
      .order('name', { ascending: true })

    if (error) throw new Error(`1-5) stores 로드 실패: ${error.message}`)
    setStores((data as StoreRow[]) ?? [])
  }

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        await fetchStores()
      } catch (e: any) {
        setError(e?.message ?? '1-0) 오류')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // 1-6) 가게 추가(중복이면 is_active=true로 살리기)
  const onAdd = async () => {
    setError(null)
    setMessage(null)

    const n = name.trim()
    if (!n) return setError('1-6) 가게명을 입력하세요.')

    setSaving(true)
    try {
      // 1-6-1) 동일 이름이 있는지 먼저 조회
      const { data: existing, error: exErr } = await supabaseClient
        .from('stores')
        .select('id, name, is_active')
        .eq('name', n)
        .maybeSingle()

      if (exErr) throw new Error(`1-6-1) 중복 확인 실패: ${exErr.message}`)

      // 1-6-2) 있으면 활성화로 업데이트
      if (existing?.id) {
        const { error: upErr } = await supabaseClient
          .from('stores')
          .update({ is_active: true })
          .eq('id', existing.id)

        if (upErr) throw new Error(`1-6-2) 재활성화 실패: ${upErr.message}`)

        setMessage('기존 가게를 다시 활성화했습니다.')
        setName('')
        await fetchStores()
        return
      }

      // 1-6-3) 없으면 새로 insert
      const { error: insErr } = await supabaseClient.from('stores').insert({
        name: n,
        is_active: true,
      })

      if (insErr) throw new Error(`1-6-3) 추가 실패: ${insErr.message}`)

      setMessage('추가되었습니다.')
      setName('')
      await fetchStores()
    } catch (e: any) {
      setError(e?.message ?? '1-6) 추가 오류')
    } finally {
      setSaving(false)
    }
  }

  // 1-7) 비활성화(안전: delete 대신 is_active=false)
  const onDeactivate = async (storeId: number) => {
    setError(null)
    setMessage(null)

    const ok = window.confirm('이 가게를 비활성화할까요? (목록에서 숨겨집니다)')
    if (!ok) return

    setDeletingId(storeId)
    try {
      const { data: updatedRows, error: upErr } = await supabaseClient
        .from('stores')
        .update({ is_active: false })
        .eq('id', storeId)
        .select('id')

      if (upErr) throw new Error(`1-7) 비활성화 실패: ${upErr.message}`)
      if (!updatedRows || updatedRows.length === 0) {
        throw new Error('1-7) 비활성화 권한이 없거나 대상이 없습니다(RLS 가능성).')
      }

      setMessage('비활성화되었습니다.')
      await fetchStores()
    } catch (e: any) {
      setError(e?.message ?? '1-7) 오류')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) return <div className="text-sm text-white/60">Loading...</div>

  return (
    <div className="space-y-6">
      {/* 2-1) 헤더: 탭 네비 */}
      <PageHeader
        title="가게 관리"
        subtitle="활성 가게 목록"
        backHref="/admin"
        right={
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2">
              <NavTab label="관리자 메인" onClick={() => router.push('/admin')} active={false} />
              <NavTab label="직원 관리" onClick={() => router.push('/admin/staff')} active={false} />
              <NavTab label="가게 관리" onClick={() => router.push('/admin/stores')} active />
            </div>
            <ProButton variant="ghost" onClick={onLogout}>
              로그아웃
            </ProButton>
          </div>
        }
      />

      {/* 2-2) 추가 영역 */}
      <GlassCard className="p-6">
        <div className="text-white font-semibold tracking-tight">가게 추가</div>
        <div className="mt-4 flex flex-col sm:flex-row gap-2">
          <input
            className="flex-1 rounded-xl border border-white/12 bg-black/20 px-3 py-2.5 text-white outline-none placeholder:text-white/30 focus:border-white/25"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="가게명을 입력하세요 (예: 강남)"
            autoComplete="off"
          />
          <ProButton onClick={onAdd} disabled={saving} className="sm:w-36">
            <Plus className="mr-2 h-4 w-4" />
            {saving ? '추가 중...' : '추가'}
          </ProButton>
        </div>

        {message && (
          <div className="mt-4 rounded-xl border border-emerald-300/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {message}
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}
      </GlassCard>

      {/* 2-3) 리스트 */}
      <GlassCard className="p-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-white font-semibold tracking-tight">가게 목록</div>
            <div className="mt-1 text-sm text-white/55">활성: {activeStores.length}개</div>
          </div>
        </div>

        <div className="mt-4 divide-y divide-white/10">
          {activeStores.length === 0 && (
            <div className="py-6 text-sm text-white/60">활성 가게가 없습니다.</div>
          )}

          {activeStores.map((s) => (
            <div key={s.id} className="py-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-white font-semibold truncate">{s.name}</div>
              </div>

              <button
                onClick={() => onDeactivate(s.id)}
                disabled={deletingId === s.id}
                className={cn(
                  'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm',
                  'border border-white/12 bg-white/5 text-white/85 hover:bg-white/10 transition',
                  'disabled:opacity-60 disabled:cursor-not-allowed'
                )}
                type="button"
              >
                <Trash2 className="h-4 w-4" />
                {deletingId === s.id ? '처리 중...' : '비활성화'}
              </button>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  )
}

/* -------------------------
   3) 작은 UI
------------------------- */

function NavTab({
  label,
  onClick,
  active,
}: {
  label: string
  onClick: () => void
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-xl px-3 py-2 text-sm border transition',
        active
          ? 'bg-white text-zinc-900 border-white/0'
          : 'bg-white/5 text-white/85 border-white/12 hover:bg-white/10'
      )}
      type="button"
    >
      {label}
    </button>
  )
}
