-- TLMPS blog MVP schema.
-- Run this in Supabase Dashboard > SQL Editor after creating the project.

create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

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
  category text not null default 'School life',
  status text not null default 'draft' check (status in ('draft', 'published')),
  author_id uuid references auth.users on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists posts_published_at_idx
  on public.posts (published_at desc)
  where status = 'published';

alter table public.posts enable row level security;

create policy "Anyone can read published posts"
  on public.posts
  for select
  to anon, authenticated
  using (status = 'published');

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
  if new.status = 'published' and new.published_at is null then
    new.published_at = now();
  elsif new.status = 'draft' then
    new.published_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists posts_updated_at on public.posts;
create trigger posts_updated_at
before update on public.posts
for each row execute function public.set_posts_updated_at();

grant select on public.posts to anon, authenticated;
grant select on public.profiles to authenticated;
grant insert, update, delete on public.posts to authenticated;
