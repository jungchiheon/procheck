'use client';

import Link from 'next/link';
import React from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { canSeeManagerMenus, isSuperAdmin } from '@/lib/rbac';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Clock8, Calendar, Megaphone, Bell, Trophy,
  PackageSearch, Receipt, Building2, Users, Wallet, MessageSquare, X
} from 'lucide-react';

type Item = {
  href: string;
  label: string;
  icon: LucideIcon; // ✅ 핵심: LucideIcon 타입 사용
};

export default function Sidebar() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false); // 모바일용

  React.useEffect(() => {
    const onToggle = () => setOpen((o) => !o);
    if (typeof window !== 'undefined') {
      window.addEventListener('sidebar:toggle', onToggle);
      return () => window.removeEventListener('sidebar:toggle', onToggle);
    }
  }, []);

  if (!user) return null;

  const base: Item[] = [
    { href: '/dashboard', label: '홈', icon: LayoutDashboard },
    { href: '/notices', label: '공지', icon: Megaphone },
    { href: '/attendance', label: '출퇴근', icon: Clock8 },
    { href: '/schedule', label: '스케줄', icon: Calendar },
    { href: '/sales', label: '매출', icon: Wallet },
    { href: '/calls', label: '호출', icon: Bell },
    { href: '/rankings', label: '랭킹', icon: Trophy },
    { href: '/lost', label: '분실물', icon: PackageSearch },
    { href: '/messages', label: '채팅', icon: MessageSquare }, // ✅ 복구
  ];

  const managerOnly: Item[] = [{ href: '/debts', label: '미수금 관리', icon: Receipt }];
  const adminOnly: Item[] = [
    { href: '/stores', label: '가게 관리', icon: Building2 },
    { href: '/users', label: '사용자 관리', icon: Users },
  ];

  const items: Item[] = [...base];
  if (canSeeManagerMenus(user.role)) items.push(...managerOnly);
  if (isSuperAdmin(user.role)) items.push(...adminOnly);

  const NavList = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav className="flex-1 px-2 space-y-1">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname?.startsWith(href);
        return (
          <Link
            key={href}
            href={href as any}
            onClick={onNavigate}
            className={[
              'flex items-center gap-3 px-3 py-2 rounded-lg transition',
              active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100',
            ].join(' ')}
          >
            <Icon size={18} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* 데스크탑 고정 사이드바 */}
      <aside className="hidden md:flex md:w-64 md:flex-col border-r border-slate-200 bg-white">
        <div className="p-4 text-xs text-slate-500">메뉴</div>
        <NavList />
        <div className="p-4 text-xs text-slate-400">© {new Date().getFullYear()} EMS</div>
      </aside>

      {/* 모바일 오버레이 사이드바 */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute left-0 top-0 h-full w-72 max-w-[85vw] bg-white border-r border-slate-200 shadow-xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="text-sm text-slate-500">메뉴</div>
              <button
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-slate-100"
                aria-label="닫기"
              >
                <X size={18} />
              </button>
            </div>
            <NavList onNavigate={() => setOpen(false)} />
            <div className="p-4 text-xs text-slate-400 mt-auto">© {new Date().getFullYear()} EMS</div>
          </div>
        </div>
      )}
    </>
  );
}