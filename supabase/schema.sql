-- ============================================================================
-- GameDeck - Supabase schema
-- Live game library + play-history log, fed daily by the n8n Exophase sync.
-- Run this once in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. games : current state of every game in the library (one row per game)
--    master_id is Exophase's stable per-game id, so upserts never duplicate.
-- ----------------------------------------------------------------------------
create table if not exists public.games (
  master_id        bigint primary key,
  environment      text        not null,              -- 'xbox' | 'psn' | 'steam'
  title            text        not null,
  platforms        text[]      default '{}',          -- e.g. {'Xbox Series X|S','Xbox One'}
  earned_awards    int         default 0,
  total_awards     int         default 0,
  percent          numeric(5,2) default 0,            -- 0..100
  earned_points    int         default 0,
  earned_exp       int         default 0,
  playtime_minutes int         default 0,             -- hours*60 + minutes
  playtime_label   text,                              -- '14h 15m' (as shown on Exophase)
  status           text,                              -- 'partial' | 'complete' | 'played' ...
  beaten           boolean,
  last_played      timestamptz,                       -- null = never played
  first_played     timestamptz,
  completion_date  timestamptz,
  cover_small      text,
  cover_standard   text,
  cover_tile       text,
  achievements_url text,
  first_seen       timestamptz default now(),         -- when the sync first saw this game
  last_synced      timestamptz default now(),
  updated_at       timestamptz default now()
);

create index if not exists games_environment_idx on public.games (environment);
create index if not exists games_last_played_idx  on public.games (last_played desc nulls last);
create index if not exists games_percent_idx      on public.games (percent desc);

-- ----------------------------------------------------------------------------
-- 2. play_events : append-only play history.
--    The sync writes a row only when a game's playtime or achievement count
--    increases between runs, so this table is a real "what I played" log.
--    On the first time a game is ever seen, minutes_delta = 0 (no fake session).
--    unique(master_id, event_date) makes a same-day re-run idempotent (upsert).
-- ----------------------------------------------------------------------------
create table if not exists public.play_events (
  id                    bigint generated always as identity primary key,
  master_id             bigint not null,
  title                 text   not null,              -- denormalised for easy display
  environment           text   not null,
  event_date            date   not null,
  minutes_delta         int    default 0,             -- minutes added since last sync
  achievements_delta    int    default 0,             -- achievements earned since last sync
  percent_after         numeric(5,2),
  playtime_minutes_after int,
  earned_awards_after   int,
  last_played           timestamptz,
  is_new                boolean default false,        -- true = first time game was seen
  created_at            timestamptz default now(),
  unique (master_id, event_date)
);

create index if not exists play_events_date_idx      on public.play_events (event_date desc);
create index if not exists play_events_master_idx    on public.play_events (master_id);

-- ----------------------------------------------------------------------------
-- 3. sync_runs : one row per daily sync, for a health/heartbeat view.
-- ----------------------------------------------------------------------------
create table if not exists public.sync_runs (
  id            bigint generated always as identity primary key,
  ran_at        timestamptz default now(),
  games_seen    int,
  games_changed int,
  status        text default 'ok',
  note          text
);

-- ----------------------------------------------------------------------------
-- 4. A couple of convenience views the app reads.
-- ----------------------------------------------------------------------------
create or replace view public.v_library_stats as
select
  count(*)                                             as total_games,
  count(*) filter (where percent >= 100)               as completed_games,
  count(*) filter (where last_played is not null)      as played_games,
  coalesce(sum(playtime_minutes),0)                    as total_minutes,
  coalesce(sum(earned_awards),0)                       as total_achievements,
  round(avg(percent),1)                                as avg_completion
from public.games;

create or replace view public.v_recent_activity as
select e.event_date, e.title, e.environment, e.minutes_delta,
       e.achievements_delta, e.percent_after, g.cover_small
from public.play_events e
left join public.games g on g.master_id = e.master_id
where e.minutes_delta > 0 or e.achievements_delta > 0
order by e.event_date desc, e.minutes_delta desc;

-- ----------------------------------------------------------------------------
-- 5. Row Level Security.
--    The phone app uses the public ANON key and only ever reads, so we expose
--    read-only SELECT to anon/authenticated. All writes come from n8n using the
--    SERVICE_ROLE key, which bypasses RLS entirely. No write policy is granted
--    to anon, so the library cannot be modified from the client.
-- ----------------------------------------------------------------------------
alter table public.games       enable row level security;
alter table public.play_events enable row level security;
alter table public.sync_runs   enable row level security;

drop policy if exists games_read       on public.games;
drop policy if exists play_events_read on public.play_events;
drop policy if exists sync_runs_read   on public.sync_runs;

create policy games_read       on public.games       for select using (true);
create policy play_events_read on public.play_events for select using (true);
create policy sync_runs_read   on public.sync_runs   for select using (true);

-- Views run with the definer's rights; expose them to the API roles.
grant select on public.v_library_stats, public.v_recent_activity to anon, authenticated;
