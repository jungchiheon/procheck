// 4-1 ProCheck 글로벌 레이아웃 (다크 강제 + AppShell)
import './globals.css';
import type { Metadata } from 'next';
import { AuthProvider } from '@/lib/auth';
import AppShell from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'ProCheck — 직원관리',
  description: 'ProCheck EMS PWA (Dark)'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="dark">
      <body>
        {/* 4-2 배경 그라디언트 데코 */}
        <div className="pointer-events-none fixed inset-0 -z-10 opacity-30">
          <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full blur-3xl bg-blue-900/50"></div>
          <div className="absolute top-1/2 -right-16 h-72 w-72 rounded-full blur-3xl bg-indigo-900/50"></div>
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full blur-3xl bg-emerald-900/40"></div>
        </div>

        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
