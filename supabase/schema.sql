-- TLMPS blog MVP schema.
-- Run this in Supabase Dashboard > SQL Editor after creating the project.

create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 180),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  excerpt text not null default '' check (char_length(excerpt) <= 500),
  content text not null default '',
  image_url text,
  gallery_urls text[] not null default '{}',
  video_url text,
  author_name text,
  category text not null default 'School life',
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published')),
  author_id uuid references auth.users on delete set null,
  scheduled_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep an existing MVP project compatible before policies reference the
-- scheduling column or the expanded status values.
alter table public.posts add column if not exists gallery_urls text[] not null default '{}';
alter table public.posts add column if not exists video_url text;
alter table public.posts add column if not exists author_name text;
alter table public.posts add column if not exists scheduled_at timestamptz;
alter table public.posts drop constraint if exists posts_status_check;
alter table public.posts add constraint posts_status_check
  check (status in ('draft', 'scheduled', 'published'));

create index if not exists posts_published_at_idx
  on public.posts (published_at desc)
  where status = 'published';

alter table public.posts enable row level security;

drop policy if exists "Anyone can read published posts" on public.posts;
create policy "Anyone can read published posts"
  on public.posts
  for select
  to anon, authenticated
  using (status = 'published' and published_at is not null and published_at <= now());

drop policy if exists "Admins can read all posts" on public.posts;
create policy "Admins can read all posts"
  on public.posts
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.is_admin = true
    )
  );

drop policy if exists "Admins can create posts" on public.posts;
create policy "Admins can create posts"
  on public.posts
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.is_admin = true
    )
    and author_id = (select auth.uid())
  );

drop policy if exists "Admins can update posts" on public.posts;
create policy "Admins can update posts"
  on public.posts
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.is_admin = true
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.is_admin = true
    )
  );

drop policy if exists "Admins can delete posts" on public.posts;
create policy "Admins can delete posts"
  on public.posts
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.is_admin = true
    )
  );

create or replace function public.set_posts_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  if new.status = 'published' then
    if new.published_at is null then
      new.published_at = now();
    end if;
    new.scheduled_at = null;
  elsif new.status = 'scheduled' then
    new.published_at = null;
  elsif new.status = 'draft' then
    new.scheduled_at = null;
    new.published_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists posts_updated_at on public.posts;
create trigger posts_updated_at
before insert or update on public.posts
for each row execute function public.set_posts_updated_at();

grant select on public.posts to anon, authenticated;
grant select on public.profiles to authenticated;
grant insert, update, delete on public.posts to authenticated;

create index if not exists posts_scheduled_at_idx
  on public.posts (scheduled_at)
  where status = 'scheduled';

-- Enable the extension once in Dashboard > Database > Extensions if it is not
-- already enabled, then run this scheduling job. It promotes due posts without
-- requiring an admin page or browser to remain open.
create extension if not exists pg_cron;

create or replace function public.publish_due_posts()
returns void
language sql
security invoker
set search_path = public
as $$
  update public.posts
  set status = 'published',
      published_at = now(),
      updated_at = now()
  where status = 'scheduled'
    and scheduled_at is not null
    and scheduled_at <= now();
$$;

select cron.unschedule(jobid)
from cron.job
where jobname = 'tlmps-publish-due-posts';

select cron.schedule(
  'tlmps-publish-due-posts',
  '* * * * *',
  $$select public.publish_due_posts();$$
);
