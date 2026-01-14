import type { ReactNode } from 'react'
import AdminShell from '@/components/shell/AdminShell'

// /admin 하위 전체에 공통 적용
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>
}
