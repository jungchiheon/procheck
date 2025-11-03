// 12-1 보호 라우트에서 사용되는 클라이언트 가드
'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function ClientGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    // 12-2 미인증이면 로그인으로 보냄
    if (!user) router.replace('/login');
  }, [user, router]);

  if (!user) return null; // 12-3 SSR 깜빡임 방지
  return <>{children}</>;
}
