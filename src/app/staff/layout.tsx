import type { ReactNode } from 'react'
import StaffShell from '@/components/shell/StaffShell'

// /staff 하위 전체에 공통 적용
export default function StaffLayout({ children }: { children: ReactNode }) {
  return <StaffShell>{children}</StaffShell>
}
