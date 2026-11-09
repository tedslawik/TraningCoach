-- Planned races ("events") per user. Discipline is derived from `distance`
-- (see EVENT_DISTANCES in packages/core/src/season.ts).
-- Run once in Supabase → SQL Editor.

create table if not exists public.race_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  date        date not null,
  priority    text not null check (priority in ('A', 'B', 'C')),
  distance    text not null check (char_length(distance) <= 30),
  name        text check (char_length(name) <= 60),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists race_events_user_date_idx on public.race_events (user_id, date);

alter table public.race_events enable row level security;

drop policy if exists "race_events_select_own" on public.race_events;
drop policy if exists "race_events_insert_own" on public.race_events;
drop policy if exists "race_events_update_own" on public.race_events;
drop policy if exists "race_events_delete_own" on public.race_events;

create policy "race_events_select_own" on public.race_events
  for select using (auth.uid() = user_id);
create policy "race_events_insert_own" on public.race_events
  for insert with check (auth.uid() = user_id);
create policy "race_events_update_own" on public.race_events
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "race_events_delete_own" on public.race_events
  for delete using (auth.uid() = user_id);
