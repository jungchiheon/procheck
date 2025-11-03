// 3-1 AppShell: /login에서는 네비/사이드바 숨김
'use client';
import { usePathname } from 'next/navigation';
import TopNav from '@/components/TopNav';
import Sidebar from '@/components/Sidebar';
import React from 'react';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const onlyContent = pathname === '/login';
  if (onlyContent) return <>{children}</>;
  return (
    <>
      <TopNav />
      <div className="flex min-h-[calc(100vh-4rem)]">
        <Sidebar />
        <main className="flex-1">{children}</main>
      </div>
    </>
  );
}
