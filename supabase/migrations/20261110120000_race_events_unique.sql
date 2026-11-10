-- One race per (user, date, distance). Removes existing duplicates first
-- (keeps the oldest row of each group), then enforces uniqueness.
-- Run once in Supabase → SQL Editor.

-- 1) Preview duplicates (optional — run alone to see what will be removed):
-- select user_id, date, distance, count(*) from public.race_events
-- group by 1, 2, 3 having count(*) > 1;

delete from public.race_events e
using public.race_events keep
where e.user_id  = keep.user_id
  and e.date     = keep.date
  and e.distance = keep.distance
  and (e.created_at, e.id) > (keep.created_at, keep.id);

create unique index if not exists race_events_user_date_distance_key
  on public.race_events (user_id, date, distance);
