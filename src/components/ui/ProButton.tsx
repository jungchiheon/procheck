'use client'

import { cn } from '@/lib/cn'
import type { ButtonHTMLAttributes } from 'react'

// 버튼 스타일 통일
export function ProButton({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger'
}) {
  const base =
    'inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-60 disabled:cursor-not-allowed'
  const styles =
    variant === 'primary'
      ? 'bg-white text-zinc-900 hover:bg-white/90 active:bg-white/80'
      : variant === 'danger'
        ? 'bg-red-500/90 text-white hover:bg-red-500 active:bg-red-500/80'
        : 'border border-white/12 bg-white/5 text-white/85 hover:bg-white/10'

  return <button className={cn(base, styles, className)} {...props} />
}
