-- 공지 게시판: 조회수 + 댓글
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
