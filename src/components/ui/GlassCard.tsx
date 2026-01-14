import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

// 카드(모든 페이지 공통)
export function GlassCard({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl',
        className
      )}
    >
      {children}
    </div>
  )
}
