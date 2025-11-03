'use client';
import { useAuth } from '@/lib/auth';
import { roleLabel } from '@/lib/rbac';
import { LogOut, BadgeCheck, Menu } from 'lucide-react';

export default function TopNav() {
  const { user, logout } = useAuth();

  const openSidebar = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('sidebar:toggle'));
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {/* 모바일에서 햄버거 */}
        <button
          onClick={openSidebar}
          className="md:hidden -ml-1 mr-1 inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-slate-100"
          aria-label="메뉴 열기"
          title="메뉴"
        >
          <Menu size={20} />
        </button>

        <BadgeCheck className="text-brand-600" />
        <span className="font-semibold">ProCheck</span>
      </div>

      {user && (
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-sm text-slate-600">
            <span className="px-2 py-0.5 rounded-full bg-slate-100">{roleLabel(user.role)}</span>
            <span className="font-medium">{user.nickname}</span>
          </div>
          <button
            onClick={logout}
            className="px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-700 text-sm flex items-center gap-1"
          >
            <LogOut size={16} /> 로그아웃
          </button>
        </div>
      )}
    </header>
  );
}