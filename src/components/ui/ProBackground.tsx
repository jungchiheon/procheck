import type { ReactNode } from 'react'

// 모든 페이지 공통 배경
export default function ProBackground({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* 베이스 */}
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-800" />
      
      <div className="absolute -top-28 -left-28 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute -bottom-40 -right-28 h-[28rem] w-[28rem] rounded-full bg-white/10 blur-3xl" />

      <div className="relative z-10">{children}</div>
    </div>
  )
}
