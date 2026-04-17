-- 직원용 공지사항 (관리자만 작성, 직원은 읽기 전용 — API에서 service role로 제어)
create table if not exists public.staff_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  is_active boolean not null default true
);

create index if not exists staff_announcements_created_at_idx on public.staff_announcements (created_at desc);

alter table public.staff_announcements enable row level security;
