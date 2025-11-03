// 5-2 로그인 페이지(API 사용)
'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const { user, login } = useAuth();
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');

  React.useEffect(() => { if (user) router.replace('/dashboard'); }, [user, router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError('');
      await login(username.trim(), password);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8">
          <div className="flex items-center gap-2 mb-6">
            <span className="text-brand-600 font-semibold">ProCheck</span>
            <h1 className="text-xl font-semibold">로그인</h1>
          </div>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-slate-600">아이디</label>
              <input value={username} onChange={e=>setUsername(e.target.value)} className="mt-1 w-full rounded-xl border-slate-300 focus:border-brand-500 focus:ring-brand-500" placeholder="아이디" />
            </div>
            <div>
              <label className="block text-sm text-slate-600">비밀번호</label>
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="mt-1 w-full rounded-xl border-slate-300 focus:border-brand-500 focus:ring-brand-500" placeholder="비밀번호" />
            </div>
            {error && <div className="text-red-600 text-sm">{error}</div>}
            <button className="w-full py-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-700">로그인</button>
          </form>
          <div className="text-xs text-slate-400 mt-4">데모: admin/admin123, mgr/mgr123, kim/kim123</div>
        </div>
      </div>
    </div>
  );
}