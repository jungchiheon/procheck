// 5-1 Auth 컨텍스트 (API 기반) — auth.tsx
'use client';
import React from 'react';
import { load, save, remove, LS_KEYS } from './storage';

export type User = {
  id: number;
  username: string;
  nickname: string;
  role: 'super_admin' | 'manager' | 'staff';
  managerId?: number;
};

type AuthCtx = {
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
};

export const AuthContext = React.createContext<AuthCtx>({
  user: null,
  login: async () => {},
  logout: () => {}
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);

  React.useEffect(() => {
    const u = load<User>(LS_KEYS.session);
    if (u) setUser(u);
  }, []);

  const login = async (username: string, password: string) => {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || '로그인 실패');
    save(LS_KEYS.session, json.user);
    setUser(json.user);
  };

  const logout = () => {
    remove(LS_KEYS.session);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => React.useContext(AuthContext);