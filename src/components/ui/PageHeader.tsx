// src/components/ui/PageHeader.tsx
'use client'

import { cn } from '@/lib/cn'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'

// 헤더(뒤로가기/제목/우측 영역)
export function PageHeader({
  title,
  subtitle,
  backHref,
  right,
}: {
  title: string
  subtitle?: string
  backHref?: string
  right?: ReactNode
}) {
  const router = useRouter()

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {/* back 버튼 */}
          {backHref && (
            <button
              onClick={() => router.push(backHref)}
              className={cn(
                'inline-flex items-center gap-1 rounded-lg',
                'border border-white/10 bg-white/5 px-2.5 py-1.5',
                'text-xs text-white/80 hover:bg-white/10 transition'
              )}
            >
              <ChevronLeft className="h-4 w-4" />
              뒤로
            </button>
          )}

          <h1 className="truncate text-lg font-semibold text-white tracking-tight">{title}</h1>
        </div>

        {subtitle && <p className="mt-1 text-sm text-white/55">{subtitle}</p>}
      </div>

      {/* 우측 영역 */}
      <div className="shrink-0">{right}</div>
    </div>
  )
}
