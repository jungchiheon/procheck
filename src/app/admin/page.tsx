// src/app/admin/page.tsx
'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabaseClient'
import { GlassCard } from '@/components/ui/GlassCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { ProButton } from '@/components/ui/ProButton'
import { AdminNotificationBell } from '@/components/AdminNotificationBell'
import { cn } from '@/lib/cn'
import { Users, Store, UserPlus, UserCheck, X } from 'lucide-react'

type Aff = 'AONE' | 'GOGO'
type StaffStatus = 'WORKING' | 'CAR_WAIT' | 'LODGE_WAIT' | 'OFF' | 'CHOICE_ING' | 'CHOICE_DONE'
type StaffLite = { id: string; nickname: string; affiliation: Aff | null; work_status: StaffStatus | null; role: string; is_active: boolean }

export default function AdminHomePage() {
  const router = useRouter()
  const [attOpen, setAttOpen] = useState(false)
  const [affTab, setAffTab] = useState<Aff>('AONE')
  const [attRows, setAttRows] = useState<StaffLite[]>([])
  const [attLoading, setAttLoading] = useState(false)
  const [attBusyId, setAttBusyId] = useState<string | null>(null)
  const [attError, setAttError] = useState<string | null>(null)

  const onLogout = async () => {
    await supabaseClient.auth.signOut()
    router.replace('/login')
  }

  const isOnShift = (s: StaffStatus | null | undefined) => Boolean(s && s !== 'OFF')

  const loadAttendanceRows = async () => {
    setAttLoading(true)
    setAttError(null)
    try {
      const { data, error } = await supabaseClient
        .from('user_profiles')
        .select('id, nickname, affiliation, work_status, role, is_active')
        .eq('role', 'staff')
        .eq('is_active', true)
      if (error) throw new Error(`근태 목록 조회 실패: ${error.message}`)
      setAttRows((Array.isArray(data) ? data : []) as StaffLite[])
    } catch (e: any) {
      setAttError(e?.message ?? '근태 목록 조회 오류')
    } finally {
      setAttLoading(false)
    }
  }

  const openAttendance = async () => {
    setAttOpen(true)
    await loadAttendanceRows()
  }

  const onToggleAttendance = async (row: StaffLite) => {
    const next: StaffStatus = isOnShift(row.work_status) ? 'OFF' : 'CHOICE_ING'
    setAttBusyId(row.id)
    setAttError(null)
    try {
      const { data, error } = await supabaseClient
        .from('user_profiles')
        .update({ work_status: next })
        .eq('id', row.id)
        .select('work_status')
        .single()
      if (error) throw new Error(`근태 변경 실패: ${error.message}`)
      const saved = ((data?.work_status as StaffStatus | null) ?? next) as StaffStatus
      setAttRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, work_status: saved } : x)))
    } catch (e: any) {
      setAttError(e?.message ?? '근태 변경 오류')
    } finally {
      setAttBusyId(null)
    }
  }

  const filteredByAff = useMemo(() => {
    const arr = attRows.filter((r) => r.affiliation === affTab)
    arr.sort((a, b) => {
      const aOn = isOnShift(a.work_status) ? 0 : 1
      const bOn = isOnShift(b.work_status) ? 0 : 1
      if (aOn !== bOn) return aOn - bOn
      return (a.nickname || '').localeCompare(b.nickname || '', 'ko')
    })
    return arr
  }, [attRows, affTab])

  return (
    <div className="space-y-6">
      <PageHeader
        title="관리자 메인"
        right={
          <div className="flex items-center gap-2">
            <AdminNotificationBell />
            <ProButton variant="ghost" onClick={onLogout}>
              로그아웃
            </ProButton>
          </div>
        }
      />

      <GlassCard className="p-6">
        {/* 중앙 정사각형 그리드: 좌 2칸 · 우 2칸, 모서리 둥글게 */}
        <div className="mx-auto w-full max-w-sm">
          <div
            className={cn(
              'grid grid-cols-2 grid-rows-2 gap-2 sm:gap-3',
              'aspect-square w-full',
              'rounded-3xl border border-white/10 bg-black/20 p-2 sm:p-3'
            )}
          >
            <button
              onClick={() => router.push('/admin/staff')}
              className={cn(
                'group flex min-h-0 flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-3',
                'text-center hover:bg-white/10 transition',
                'aspect-square'
              )}
              type="button"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/25">
                <Users className="h-5 w-5 text-white/85" />
              </div>
              <span className="text-sm font-semibold text-white">직원 관리</span>
            </button>

            <button
              onClick={() => router.push('/admin/stores')}
              className={cn(
                'group flex min-h-0 flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-3',
                'text-center hover:bg-white/10 transition',
                'aspect-square'
              )}
              type="button"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/25">
                <Store className="h-5 w-5 text-white/85" />
              </div>
              <span className="text-sm font-semibold text-white">가게 관리</span>
            </button>

            <button
              onClick={() => router.push('/admin/staff?panel=create')}
              className={cn(
                'group flex min-h-0 flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-3',
                'text-center hover:bg-white/10 transition',
                'aspect-square'
              )}
              type="button"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/25">
                <UserPlus className="h-5 w-5 text-white/85" />
              </div>
              <span className="text-sm font-semibold text-white">직원 추가</span>
            </button>
            <button
              onClick={() => void openAttendance()}
              className={cn(
                'group flex min-h-0 flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-3',
                'text-center hover:bg-white/10 transition',
                'aspect-square'
              )}
              type="button"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/25">
                <UserCheck className="h-5 w-5 text-white/85" />
              </div>
              <span className="text-sm font-semibold text-white">직원 근태관리</span>
            </button>
          </div>
        </div>
      </GlassCard>

      {attOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <button className="absolute inset-0 bg-black/60" onClick={() => setAttOpen(false)} type="button" aria-label="닫기" />
          <div className="relative w-full max-w-2xl">
            <GlassCard className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-white text-base font-semibold">직원 근태관리</div>
                  <div className="mt-1 text-xs text-white/50">고고/에이원 탭에서 직원을 눌러 출퇴근을 토글하세요.</div>
                </div>
                <button
                  onClick={() => setAttOpen(false)}
                  className="rounded-xl border border-white/12 bg-white/5 p-2 text-white/80 hover:bg-white/10 transition"
                  type="button"
                  aria-label="닫기"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                {(['AONE', 'GOGO'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setAffTab(k)}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-sm font-semibold transition',
                      affTab === k ? 'bg-white text-zinc-900 border-white/0' : 'bg-white/5 text-white/85 border-white/12 hover:bg-white/10'
                    )}
                  >
                    {k === 'AONE' ? '에이원' : '고고'}
                  </button>
                ))}
              </div>

              {attError && <div className="mt-3 rounded-lg border border-red-400/35 bg-red-500/15 px-2.5 py-2 text-xs text-red-100">{attError}</div>}
              {attLoading && <div className="mt-3 text-xs text-white/50">불러오는 중…</div>}

              {!attLoading && (
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {filteredByAff.map((s) => {
                    const on = isOnShift(s.work_status)
                    const busy = attBusyId === s.id
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={busy}
                        onClick={() => void onToggleAttendance(s)}
                        className={cn(
                          'rounded-lg border px-2 py-2 text-[11px] font-semibold leading-tight transition',
                          on
                            ? 'border-emerald-400/35 bg-emerald-500/18 text-emerald-100 hover:bg-emerald-500/25'
                            : 'border-rose-400/35 bg-rose-500/16 text-rose-100 hover:bg-rose-500/22',
                          busy && 'opacity-60'
                        )}
                      >
                        <div className="truncate">{s.nickname}</div>
                        <div className={cn('mt-0.5 text-[10px]', on ? 'text-emerald-200/85' : 'text-rose-200/85')}>{on ? '출근' : '퇴근'}</div>
                      </button>
                    )
                  })}
                </div>
              )}
            </GlassCard>
          </div>
        </div>
      )}
    </div>
  )
}
