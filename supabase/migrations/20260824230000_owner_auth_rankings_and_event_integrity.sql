-- GameDeck owner authentication, explicit ranking, and same-day event integrity.
-- The service_role used by n8n continues to bypass RLS. Browser access is
-- restricted to a signed Supabase JWT for the one authorized email.

create or replace function public.is_gamedeck_owner()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(lower((select auth.jwt())->>'email') = 'ddibara@gmail.com', false)
$$;

revoke all on function public.is_gamedeck_owner() from public, anon;
grant execute on function public.is_gamedeck_owner() to authenticated, service_role;

create table if not exists public.game_ranks (
  master_id bigint primary key references public.games(master_id) on delete cascade,
  score numeric(9,2) not null default 1500,
  comparison_count integer not null default 0 check (comparison_count >= 0),
  reaction text not null check (reaction in ('loved', 'liked', 'mixed', 'not_for_me')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rank_comparisons (
  id bigint generated always as identity primary key,
  left_id bigint not null references public.games(master_id) on delete cascade,
  right_id bigint not null references public.games(master_id) on delete cascade,
  result text not null check (result in ('left', 'right', 'skip')),
  left_score_before numeric(9,2),
  right_score_before numeric(9,2),
  rating_delta numeric(9,2),
  compared_at timestamptz not null default now(),
  check (left_id <> right_id)
);

create index if not exists game_ranks_score_idx
  on public.game_ranks (score desc, comparison_count asc);
create index if not exists rank_comparisons_pair_idx
  on public.rank_comparisons (least(left_id, right_id), greatest(left_id, right_id), compared_at desc);
create index if not exists rank_comparisons_recent_idx
  on public.rank_comparisons (compared_at desc);

create or replace function public.set_rank_reaction(p_master_id bigint, p_reaction text)
returns public.game_ranks
language plpgsql
security definer
set search_path = ''
as $$
declare
  seeded numeric(9,2);
  result_row public.game_ranks;
begin
  if not public.is_gamedeck_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_reaction not in ('loved', 'liked', 'mixed', 'not_for_me') then
    raise exception 'invalid reaction' using errcode = '22023';
  end if;
  if not exists (select 1 from public.games where master_id = p_master_id) then
    raise exception 'unknown game' using errcode = '22023';
  end if;

  seeded := case p_reaction
    when 'loved' then 1650
    when 'liked' then 1550
    when 'mixed' then 1450
    when 'not_for_me' then 1350
  end;

  insert into public.game_ranks (master_id, score, reaction)
  values (p_master_id, seeded, p_reaction)
  on conflict (master_id) do update
  set reaction = excluded.reaction,
      score = case when public.game_ranks.comparison_count = 0 then excluded.score else public.game_ranks.score end,
      updated_at = now()
  returning * into result_row;

  return result_row;
end;
$$;

create or replace function public.record_rank_comparison(
  p_left_id bigint,
  p_right_id bigint,
  p_result text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  left_row public.game_ranks;
  right_row public.game_ranks;
  expected_left numeric;
  k_factor integer;
  delta numeric(9,2) := 0;
  actual_left numeric;
begin
  if not public.is_gamedeck_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_left_id = p_right_id or p_result not in ('left', 'right', 'skip') then
    raise exception 'invalid comparison' using errcode = '22023';
  end if;

  -- Lock in canonical id order so two near-simultaneous taps cannot deadlock or
  -- calculate from the same stale scores.
  perform 1
  from public.game_ranks
  where master_id in (p_left_id, p_right_id)
  order by master_id
  for update;

  select * into left_row from public.game_ranks where master_id = p_left_id;
  select * into right_row from public.game_ranks where master_id = p_right_id;
  if left_row.master_id is null or right_row.master_id is null then
    raise exception 'both games need reactions first' using errcode = '22023';
  end if;

  if p_result <> 'skip' then
    actual_left := case when p_result = 'left' then 1 else 0 end;
    expected_left := 1 / (1 + power(10::numeric, (right_row.score - left_row.score) / 400));
    k_factor := case when left_row.comparison_count < 6 or right_row.comparison_count < 6 then 32 else 16 end;
    delta := round((k_factor * (actual_left - expected_left))::numeric, 2);

    update public.game_ranks
    set score = score + delta,
        comparison_count = comparison_count + 1,
        updated_at = now()
    where master_id = p_left_id;

    update public.game_ranks
    set score = score - delta,
        comparison_count = comparison_count + 1,
        updated_at = now()
    where master_id = p_right_id;
  end if;

  insert into public.rank_comparisons (
    left_id, right_id, result, left_score_before, right_score_before, rating_delta
  ) values (
    p_left_id, p_right_id, p_result, left_row.score, right_row.score,
    case when p_result = 'skip' then null else delta end
  );

  return jsonb_build_object(
    'left_id', p_left_id,
    'right_id', p_right_id,
    'result', p_result,
    'delta', case when p_result = 'skip' then null else delta end
  );
end;
$$;

revoke all on function public.set_rank_reaction(bigint, text) from public, anon;
revoke all on function public.record_rank_comparison(bigint, bigint, text) from public, anon;
grant execute on function public.set_rank_reaction(bigint, text) to authenticated;
grant execute on function public.record_rank_comparison(bigint, bigint, text) to authenticated;

-- Existing syncs upsert one row per game/day. A second session on the same day
-- previously replaced the first session's delta. Merge only unseen monotonic
-- progress; an HTTP retry with the same after-state adds zero and stays idempotent.
create or replace function public.merge_play_event_day()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  minute_increment bigint := 0;
  achievement_increment integer := 0;
begin
  if new.playtime_minutes_after is not null and old.playtime_minutes_after is not null then
    minute_increment := greatest(new.playtime_minutes_after - old.playtime_minutes_after, 0);
  elsif old.playtime_minutes_after is null then
    minute_increment := greatest(coalesce(new.minutes_delta, 0), 0);
  end if;

  if new.earned_awards_after is not null and old.earned_awards_after is not null then
    achievement_increment := greatest(new.earned_awards_after - old.earned_awards_after, 0);
  elsif old.earned_awards_after is null then
    achievement_increment := greatest(coalesce(new.achievements_delta, 0), 0);
  end if;

  new.minutes_delta := coalesce(old.minutes_delta, 0) + minute_increment;
  new.achievements_delta := coalesce(old.achievements_delta, 0) + achievement_increment;
  new.playtime_minutes_after := greatest(coalesce(old.playtime_minutes_after, 0), coalesce(new.playtime_minutes_after, 0));
  new.earned_awards_after := greatest(coalesce(old.earned_awards_after, 0), coalesce(new.earned_awards_after, 0));
  new.last_played := greatest(old.last_played, new.last_played);
  new.is_new := coalesce(old.is_new, false) or coalesce(new.is_new, false);
  new.created_at := old.created_at;
  return new;
end;
$$;

revoke all on function public.merge_play_event_day() from public, anon, authenticated;

drop trigger if exists play_events_merge_same_day on public.play_events;
create trigger play_events_merge_same_day
before update on public.play_events
for each row execute function public.merge_play_event_day();

-- Remove broad default grants first, then add only what the signed owner needs.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

do $$
declare
  table_name text;
  policy_name text;
begin
  for table_name in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('alter table public.%I enable row level security', table_name);
    for policy_name in
      select p.policyname from pg_policies p
      where p.schemaname = 'public' and p.tablename = table_name
    loop
      execute format('drop policy %I on public.%I', policy_name, table_name);
    end loop;
  end loop;
end
$$;

create policy owner_read_games on public.games for select to authenticated
  using ((select public.is_gamedeck_owner()));
create policy owner_read_play_events on public.play_events for select to authenticated
  using ((select public.is_gamedeck_owner()));
create policy owner_read_sync_runs on public.sync_runs for select to authenticated
  using ((select public.is_gamedeck_owner()));
create policy owner_read_news on public.news for select to authenticated
  using ((select public.is_gamedeck_owner()));
create policy owner_read_gamepass on public.gamepass for select to authenticated
  using ((select public.is_gamedeck_owner()));
create policy owner_read_wishlist_events on public.wishlist_events for select to authenticated
  using ((select public.is_gamedeck_owner()));

create policy owner_all_wishlist on public.wishlist for all to authenticated
  using ((select public.is_gamedeck_owner()))
  with check ((select public.is_gamedeck_owner()));
create policy owner_all_game_status on public.game_status for all to authenticated
  using ((select public.is_gamedeck_owner()))
  with check ((select public.is_gamedeck_owner()));
create policy owner_all_game_ratings on public.game_ratings for all to authenticated
  using ((select public.is_gamedeck_owner()))
  with check ((select public.is_gamedeck_owner()));
create policy owner_read_game_ranks on public.game_ranks for select to authenticated
  using ((select public.is_gamedeck_owner()));
create policy owner_read_rank_comparisons on public.rank_comparisons for select to authenticated
  using ((select public.is_gamedeck_owner()));

grant select on public.games, public.play_events, public.sync_runs, public.news,
  public.gamepass, public.wishlist_events, public.game_ranks,
  public.rank_comparisons to authenticated;
grant select, insert, update, delete on public.wishlist, public.game_status,
  public.game_ratings to authenticated;

alter view public.v_library_stats set (security_invoker = true);
alter view public.v_recent_activity set (security_invoker = true);
alter view public.v_gaming_profile set (security_invoker = true);
grant select on public.v_library_stats, public.v_recent_activity,
  public.v_gaming_profile to authenticated;

-- These operational functions are for service-role workflows, not browsers.
revoke all on function public.claim_wishlist_releases() from public, anon, authenticated;
revoke all on function public.mark_wishlist_event_notified(bigint) from public, anon, authenticated;
grant execute on function public.claim_wishlist_releases() to service_role;
grant execute on function public.mark_wishlist_event_notified(bigint) to service_role;
