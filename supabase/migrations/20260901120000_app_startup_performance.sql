-- Compact owner-scoped startup payloads. Both functions are SECURITY INVOKER,
-- so the existing RLS policies remain the authorization boundary.

create or replace function public.get_app_bootstrap(recent_since timestamptz)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'library_count', (select count(*) from public.games),
    'owned_igdb_ids', coalesce((
      select jsonb_agg(ids.igdb_id order by ids.igdb_id)
      from (
        select distinct g.igdb_id
        from public.games g
        where g.igdb_id is not null
      ) ids
    ), '[]'::jsonb),
    'recent_games', coalesce((
      select jsonb_agg(to_jsonb(recent) order by recent.last_played desc nulls last)
      from (
        select
          g.master_id,
          g.environment,
          g.title,
          g.platforms,
          g.earned_awards,
          g.total_awards,
          g.percent,
          g.playtime_minutes,
          g.playtime_label,
          g.last_played,
          g.length_minutes,
          g.genre,
          g.release_year,
          g.cover_igdb,
          g.igdb_id,
          g.igdb_rating,
          g.franchises
        from public.games g
        where g.last_played >= recent_since
        order by g.last_played desc nulls last
      ) recent
    ), '[]'::jsonb)
  );
$$;

comment on function public.get_app_bootstrap(timestamptz) is
  'Owner-scoped Home bootstrap: count, owned IGDB ids, and recently played game rows.';

revoke all on function public.get_app_bootstrap(timestamptz) from public, anon;
grant execute on function public.get_app_bootstrap(timestamptz) to authenticated, service_role;

create or replace function public.get_for_you_bootstrap()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'games', coalesce((
      select jsonb_agg(to_jsonb(recent_games) order by recent_games.last_played desc nulls last)
      from (
        select g.master_id, g.title, g.keywords, g.playtime_minutes, g.last_played
        from public.games g
        where g.last_played is not null
        order by g.last_played desc nulls last
        limit 100
      ) recent_games
    ), '[]'::jsonb),
    'ranks', coalesce((
      select jsonb_agg(to_jsonb(ranks))
      from (
        select r.master_id, r.score, r.reaction, r.comparison_count
        from public.game_ranks r
      ) ranks
    ), '[]'::jsonb),
    'activity', coalesce((
      select jsonb_agg(to_jsonb(activity) order by activity.event_date desc)
      from (
        select a.*
        from public.v_recent_activity a
        where a.event_date >= current_date - 90
        order by a.event_date desc
        limit 500
      ) activity
    ), '[]'::jsonb),
    'wishlist', coalesce((
      select jsonb_agg(jsonb_build_object('igdb_id', w.igdb_id))
      from public.wishlist w
    ), '[]'::jsonb),
    'lane_feedback', coalesce((
      select jsonb_agg(to_jsonb(lane_feedback))
      from (
        select f.lane_key, f.exposure_count, f.detail_open_count,
          f.meaningful_outcome_count, f.last_shown_at
        from public.v_recommendation_lane_feedback f
      ) lane_feedback
    ), '[]'::jsonb),
    'game_feedback', coalesce((
      select jsonb_agg(to_jsonb(game_feedback))
      from (
        select f.igdb_id, f.exposure_count, f.detail_open_count,
          f.meaningful_outcome_count, f.ignored_streak,
          f.last_positive_at, f.last_shown_at
        from public.v_recommendation_game_feedback f
      ) game_feedback
    ), '[]'::jsonb)
  );
$$;

comment on function public.get_for_you_bootstrap() is
  'Owner-scoped compact evidence bundle used to build the For You taste profile.';

revoke all on function public.get_for_you_bootstrap() from public, anon;
grant execute on function public.get_for_you_bootstrap() to authenticated, service_role;

-- The app asks for the newest news timestamp at launch. Without this index the
-- one-row query scans and sorts the entire table.
create index if not exists news_created_at_desc_idx
  on public.news (created_at desc);
