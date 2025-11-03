'use client';
import { User } from '@/lib/auth';

export async function apiFetch(path: string, opts: RequestInit = {}, user?: User | null) {
  const headers = new Headers(opts.headers || {});
  if (user) {
    headers.set('x-user-id', String(user.id));
    headers.set('x-role', user.role);
  }
  headers.set('content-type', 'application/json');
  const res = await fetch(path, { ...opts, headers, cache: 'no-store' });
  if (!res.ok) {
    const err = await res.json().catch(()=>({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}