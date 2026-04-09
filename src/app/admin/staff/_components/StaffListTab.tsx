'use client'

import type { RefObject } from 'react'
import { GlassCard } from '@/components/ui/GlassCard'
import { ProButton } from '@/components/ui/ProButton'
import { cn } from '@/lib/cn'
import { X } from 'lucide-react'
import type { StaffAffiliation, StaffGroup, StaffRow, SortMode } from '../staff-admin.types'
import { AFFILIATION_LABEL, GROUP_LABEL, GROUP_ORDER } from '../staff-admin.types'

export type StaffListTabProps = {
  syncing: boolean
  visible: StaffRow[]
  grouped: Map<StaffGroup, StaffRow[]>
  sortMode: SortMode
  setSortMode: (m: SortMode) => void
  sentinelRef: RefObject<HTMLDivElement | null>
  onStaffClick: (staffId: string) => void
  isPending: boolean
  sectionTitleClass: (g: StaffGroup) => string
  open: boolean
  setOpen: (open: boolean) => void
  loginId: string
  setLoginId: (v: string) => void
  password: string
  setPassword: (v: string) => void
  nickname: string
  setNickname: (v: string) => void
  createAffiliation: StaffAffiliation
  setCreateAffiliation: (v: StaffAffiliation) => void
  onCreate: () => void
  creating: boolean
}

export function StaffListTab(props: StaffListTabProps) {
  const {
    syncing,
    visible,
    grouped,
    sortMode,
    setSortMode,
    sentinelRef,
    onStaffClick,
    isPending,
    sectionTitleClass,
    open,
    setOpen,
    loginId,
    setLoginId,
    password,
    setPassword,
    nickname,
    setNickname,
    createAffiliation,
    setCreateAffiliation,
    onCreate,
    creating,
  } = props

  return (
    <>
      <GlassCard className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-white font-semibold tracking-tight">직원 목록</div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSortMode('visit')}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm border transition',
                sortMode === 'visit' ? 'bg-white text-zinc-900 border-white/0' : 'bg-white/5 text-white/80 border-white/12 hover:bg-white/10'
              )}
              type="button"
            >
              변경순
            </button>
            <button
              onClick={() => setSortMode('status')}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm border transition',
                sortMode === 'status' ? 'bg-white text-zinc-900 border-white/0' : 'bg-white/5 text-white/80 border-white/12 hover:bg-white/10'
              )}
              type="button"
            >
              상태순
            </button>

            <ProButton onClick={() => setOpen(true)} type="button" className={cn('!rounded-lg !px-3 !py-1.5 !text-sm !font-semibold !border')}>
              직원 추가
            </ProButton>
          </div>
        </div>

        <div className="mt-3">
          {visible.length === 0 && <div className="py-5 text-sm text-white/60">{syncing ? '불러오는 중…' : '직원이 없습니다.'}</div>}

          {GROUP_ORDER.map((g) => {
            const arr = grouped.get(g) ?? []
            if (arr.length === 0) return null

            return (
              <div key={g} className="mt-4 first:mt-0">
                <div className="flex items-center justify-between">
                  <div className={cn('text-sm font-semibold', sectionTitleClass(g))}>{GROUP_LABEL[g]}</div>
                  <div className="text-xs text-white/40">{arr.length}명</div>
                </div>

                <div className="mt-2 divide-y divide-white/10 rounded-2xl border border-white/10 bg-black/10">
                  {arr.map((s) => {
                    return (
                      <button
                        key={s.id}
                        onClick={() => onStaffClick(s.id)}
                        className={cn('w-full text-left rounded-xl transition', 'px-3 py-3 hover:bg-white/5')}
                        type="button"
                        disabled={isPending}
                      >
                        <div className="min-w-0">
                          <div className="text-white text-sm font-semibold truncate">{s.nickname}</div>
                          <div className="mt-0.5 text-[11px] text-white/35 truncate">{s.login_id}</div>
                          {s.affiliation && (
                            <div className="mt-0.5 text-[11px] text-white/45">{AFFILIATION_LABEL[s.affiliation]}</div>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}

          <div ref={sentinelRef} className="h-8" />
        </div>
      </GlassCard>

      {/* 직원 추가 모달 */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <button className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} type="button" aria-label="닫기" />
          <div className="relative w-full max-w-md">
            <GlassCard className="p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-white text-lg font-semibold">직원 추가</div>
                  <div className="mt-1 text-sm text-white/55">로그인ID/비밀번호/닉네임/소속</div>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-white/12 bg-white/5 p-2 text-white/80 hover:bg-white/10 transition"
                  type="button"
                  aria-label="닫기"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="text-sm font-medium text-white/80">로그인ID</label>
                  <input
                    className="mt-2 w-full rounded-xl border border-white/12 bg-black/20 px-3 py-2.5 text-white outline-none placeholder:text-white/30 focus:border-white/25"
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    placeholder="staff03"
                    autoComplete="off"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-white/80">비밀번호</label>
                  <input
                    type="password"
                    className="mt-2 w-full rounded-xl border border-white/12 bg-black/20 px-3 py-2.5 text-white outline-none placeholder:text-white/30 focus:border-white/25"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-white/80">닉네임</label>
                  <input
                    className="mt-2 w-full rounded-xl border border-white/12 bg-black/20 px-3 py-2.5 text-white outline-none placeholder:text-white/30 focus:border-white/25"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="직원3"
                    autoComplete="off"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-white/80">소속</label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(['AONE', 'GOGO'] as const).map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setCreateAffiliation(key)}
                        className={cn(
                          'rounded-xl border px-3 py-2.5 text-sm font-semibold transition',
                          createAffiliation === key
                            ? 'bg-white text-zinc-900 border-white/0'
                            : 'bg-white/5 text-white/85 border-white/12 hover:bg-white/10'
                        )}
                      >
                        {AFFILIATION_LABEL[key]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2 flex gap-2">
                  <ProButton variant="ghost" className="flex-1" onClick={() => setOpen(false)} type="button">
                    취소
                  </ProButton>
                  <ProButton className="flex-1" onClick={onCreate} disabled={creating} type="button">
                    {creating ? '생성 중...' : '생성'}
                  </ProButton>
                </div>
              </div>
            </GlassCard>
          </div>
        </div>
      )}
    </>
  )
}
