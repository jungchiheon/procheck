-- Supabase SQL Editor에서 한 번 실행하세요. (테이블 없음 오류 해결)
-- public.staff_announcements + announcement_comments + view_count

create table if not exists public.staff_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  is_active boolean not null default true,
  view_count integer not null default 0
);

create index if not exists staff_announcements_created_at_idx
  on public.staff_announcements (created_at desc);

alter table public.staff_announcements enable row level security;

-- 기존에 view_count 없이 만들어진 테이블 대비
alter table public.staff_announcements
  add column if not exists view_count integer not null default 0;

create table if not exists public.announcement_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.staff_announcements (id) on delete cascade,
  author_id uuid not null references public.user_profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists announcement_comments_post_created_idx
  on public.announcement_comments (post_id, created_at desc);

alter table public.announcement_comments enable row level security;

-- PostgREST 스키마 캐시 갱신 (테이블 만든 직후 API가 못 찾을 때)
notify pgrst, 'reload schema';
