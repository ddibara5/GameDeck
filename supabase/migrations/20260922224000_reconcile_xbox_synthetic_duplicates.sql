create or replace function public.reconcile_xbox_synthetic_game(p_canonical_id bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_c public.games%rowtype;
  v_s public.games%rowtype;
  v_synth_id bigint;
  v_candidate_count integer := 0;
  v_canonical_count integer := 0;
  v_norm text;
  v_event record;
begin
  select g.*
    into v_c
  from public.games g
  where g.master_id = p_canonical_id
  for update;

  if not found
     or v_c.environment is distinct from 'xbox'
     or (v_c.master_id >= 3000000000000 and v_c.master_id < 4000000000000) then
    return null;
  end if;

  v_synth_id := null;

  -- Strongest identity: one synthetic Xbox row and one canonical Xbox row share
  -- the same IGDB identity. Deliberately refuse ambiguous legacy duplicates.
  if v_c.igdb_id is not null then
    select count(*), min(g.master_id)
      into v_candidate_count, v_synth_id
    from public.games g
    where g.environment = 'xbox'
      and g.master_id >= 3000000000000
      and g.master_id < 4000000000000
      and g.xbox_title_id is not null
      and g.igdb_id is not null
      and g.master_id = 3000000000000 + g.xbox_title_id
      and g.igdb_id = v_c.igdb_id;

    if v_candidate_count = 1 then
      select count(*)
        into v_canonical_count
      from public.games g
      where g.environment = 'xbox'
        and not (g.master_id >= 3000000000000 and g.master_id < 4000000000000)
        and g.igdb_id = v_c.igdb_id;

      if v_canonical_count <> 1 then
        v_synth_id := null;
      end if;
    else
      v_synth_id := null;
    end if;
  end if;

  -- Exophase can insert its canonical row before IGDB enrichment has populated
  -- igdb_id. In that short window, fall back only to an exact normalized title,
  -- and only when both the synthetic and canonical side are unique.
  if v_synth_id is null then
    v_norm := regexp_replace(lower(coalesce(v_c.title, '')), '[^a-z0-9]+', '', 'g');

    if v_norm <> '' then
      select count(*), min(g.master_id)
        into v_candidate_count, v_synth_id
      from public.games g
      where g.environment = 'xbox'
        and g.master_id >= 3000000000000
        and g.master_id < 4000000000000
        and g.xbox_title_id is not null
        and g.igdb_id is not null
        and g.master_id = 3000000000000 + g.xbox_title_id
        and regexp_replace(lower(coalesce(g.title, '')), '[^a-z0-9]+', '', 'g') = v_norm
        and (v_c.igdb_id is null or g.igdb_id = v_c.igdb_id);

      if v_candidate_count = 1 then
        select count(*)
          into v_canonical_count
        from public.games g
        where g.environment = 'xbox'
          and not (g.master_id >= 3000000000000 and g.master_id < 4000000000000)
          and regexp_replace(lower(coalesce(g.title, '')), '[^a-z0-9]+', '', 'g') = v_norm;

        if v_canonical_count <> 1 then
          v_synth_id := null;
        end if;
      else
        v_synth_id := null;
      end if;
    end if;
  end if;

  if v_synth_id is null then
    return null;
  end if;

  select g.*
    into v_s
  from public.games g
  where g.master_id = v_synth_id
  for update;

  if not found then
    return null;
  end if;

  -- If either copy has already been curated/ranked, do not make a silent
  -- judgement about which user-authored state wins. These synthetic rows are
  -- normally reconciled immediately, before any such references can exist.
  if exists (select 1 from public.game_status gs where gs.master_id = v_s.master_id)
     or exists (select 1 from public.game_ratings gr where gr.master_id = v_s.master_id)
     or exists (select 1 from public.game_ranks gr where gr.master_id = v_s.master_id)
     or exists (select 1 from public.rank_comparisons rc where rc.left_id = v_s.master_id or rc.right_id = v_s.master_id) then
    return null;
  end if;

  if v_c.xbox_title_id is not null
     and v_s.xbox_title_id is not null
     and v_c.xbox_title_id <> v_s.xbox_title_id then
    return null;
  end if;

  -- Keep the Exophase row as the canonical library identity, but adopt the
  -- direct Xbox identity and the strongest known totals/metadata from the
  -- temporary synthetic row.
  update public.games g
  set xbox_title_id = coalesce(g.xbox_title_id, v_s.xbox_title_id),
      igdb_id = coalesce(g.igdb_id, v_s.igdb_id),
      cover_igdb = coalesce(g.cover_igdb, v_s.cover_igdb),
      release_year = coalesce(g.release_year, v_s.release_year),
      igdb_rating = coalesce(g.igdb_rating, v_s.igdb_rating),
      genre = coalesce(g.genre, v_s.genre),
      length_minutes = coalesce(g.length_minutes, v_s.length_minutes),
      keywords = case
        when g.keywords is null or cardinality(g.keywords) = 0 then v_s.keywords
        else g.keywords
      end,
      franchises = case
        when g.franchises is null or cardinality(g.franchises) = 0 then v_s.franchises
        else g.franchises
      end,
      playtime_label = case
        when v_s.playtime_minutes is not null
             and (g.playtime_minutes is null or v_s.playtime_minutes >= g.playtime_minutes)
          then coalesce(v_s.playtime_label, g.playtime_label)
        else g.playtime_label
      end,
      playtime_minutes = greatest(g.playtime_minutes, v_s.playtime_minutes),
      earned_awards = greatest(g.earned_awards, v_s.earned_awards),
      total_awards = greatest(g.total_awards, v_s.total_awards),
      earned_points = greatest(g.earned_points, v_s.earned_points),
      percent = greatest(g.percent, v_s.percent),
      last_played = greatest(g.last_played, v_s.last_played),
      first_seen = least(g.first_seen, v_s.first_seen),
      last_synced = greatest(g.last_synced, v_s.last_synced),
      direct_synced_at = greatest(g.direct_synced_at, v_s.direct_synced_at),
      enriched_at = greatest(g.enriched_at, v_s.enriched_at),
      updated_at = now()
  where g.master_id = v_c.master_id;

  -- Prefer the direct Xbox day-level history. Remove only same-day canonical
  -- conflicts, then move each synthetic event in date order so the existing
  -- delta-recompute triggers retain the correct cumulative progression.
  for v_event in
    select pe.id, pe.event_date
    from public.play_events pe
    where pe.master_id = v_s.master_id
    order by pe.event_date, pe.id
  loop
    delete from public.play_events pe
    where pe.master_id = v_c.master_id
      and pe.event_date = v_event.event_date;

    update public.play_events pe
    set master_id = v_c.master_id,
        title = v_c.title,
        environment = 'xbox'
    where pe.id = v_event.id;
  end loop;

  delete from public.games g
  where g.master_id = v_s.master_id;

  return v_s.master_id;
end;
$function$;

create or replace function public.reconcile_xbox_synthetic_duplicates()
returns table(canonical_master_id bigint, synthetic_master_id bigint)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_canonical_id bigint;
  v_synthetic_id bigint;
begin
  for v_canonical_id in
    select distinct c.master_id
    from public.games c
    where c.environment = 'xbox'
      and not (c.master_id >= 3000000000000 and c.master_id < 4000000000000)
      and exists (
        select 1
        from public.games s
        where s.environment = 'xbox'
          and s.master_id >= 3000000000000
          and s.master_id < 4000000000000
          and s.xbox_title_id is not null
          and s.igdb_id is not null
          and s.master_id = 3000000000000 + s.xbox_title_id
          and (
            (c.igdb_id is not null and s.igdb_id = c.igdb_id)
            or (
              regexp_replace(lower(coalesce(c.title, '')), '[^a-z0-9]+', '', 'g') <> ''
              and regexp_replace(lower(coalesce(c.title, '')), '[^a-z0-9]+', '', 'g')
                = regexp_replace(lower(coalesce(s.title, '')), '[^a-z0-9]+', '', 'g')
              and (c.igdb_id is null or c.igdb_id = s.igdb_id)
            )
          )
      )
    order by c.master_id
  loop
    v_synthetic_id := public.reconcile_xbox_synthetic_game(v_canonical_id);
    if v_synthetic_id is not null then
      canonical_master_id := v_canonical_id;
      synthetic_master_id := v_synthetic_id;
      return next;
    end if;
  end loop;
end;
$function$;

-- Repair any unambiguous synthetic/canonical pair that arrived before this
-- migration, including the recent Xbox discovery duplicates.
do $do$
begin
  perform * from public.reconcile_xbox_synthetic_duplicates();
end;
$do$;

create or replace function public.reconcile_xbox_synthetic_game_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.environment is distinct from 'xbox'
     or (new.master_id >= 3000000000000 and new.master_id < 4000000000000)
     or new.xbox_title_id is not null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.igdb_id is not distinct from old.igdb_id
       and new.title is not distinct from old.title
       and new.environment is not distinct from old.environment then
      return new;
    end if;
  end if;

  perform public.reconcile_xbox_synthetic_game(new.master_id);
  return new;
end;
$function$;

drop trigger if exists games_reconcile_xbox_synthetic_duplicate on public.games;

create trigger games_reconcile_xbox_synthetic_duplicate
after insert or update of title, environment, igdb_id on public.games
for each row
execute function public.reconcile_xbox_synthetic_game_trigger();

revoke all on function public.reconcile_xbox_synthetic_game(bigint) from public, anon, authenticated;
revoke all on function public.reconcile_xbox_synthetic_duplicates() from public, anon, authenticated;
revoke all on function public.reconcile_xbox_synthetic_game_trigger() from public, anon, authenticated;

grant execute on function public.reconcile_xbox_synthetic_game(bigint) to service_role;
grant execute on function public.reconcile_xbox_synthetic_duplicates() to service_role;

comment on function public.reconcile_xbox_synthetic_game(bigint) is
  'Adopts an unambiguous 3e12 Xbox discovery row into its canonical Exophase game identity, preserving direct Xbox history and removing the temporary duplicate.';

comment on function public.reconcile_xbox_synthetic_duplicates() is
  'Sweeps unambiguous Xbox synthetic/canonical duplicates. Service-role only; normal new duplicates are reconciled automatically by the games trigger.';
