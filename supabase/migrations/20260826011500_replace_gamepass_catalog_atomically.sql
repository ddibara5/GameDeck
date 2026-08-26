-- Replace the nightly Game Pass catalog only after the incoming payload has
-- passed a minimum-size and uniqueness check. The function call is one database
-- transaction: any malformed row or insert failure rolls the delete back, so a
-- bad upstream response can no longer erase the last known-good catalog.

create or replace function public.replace_gamepass_catalog(
  p_rows jsonb,
  p_min_rows integer default 300
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_rows integer;
  v_distinct_rows integer;
  v_previous_rows integer;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Game Pass payload must be a JSON array';
  end if;

  select count(*), count(distinct row_data.igdb_id)
    into v_rows, v_distinct_rows
  from jsonb_to_recordset(p_rows) as row_data(
    igdb_id bigint,
    name text,
    cover text,
    year integer,
    rating integer,
    released bigint,
    leaving_soon boolean,
    updated_at timestamptz
  );

  if v_rows < greatest(coalesce(p_min_rows, 300), 1) then
    raise exception 'Game Pass payload rejected: % rows is below minimum %',
      v_rows, greatest(coalesce(p_min_rows, 300), 1);
  end if;

  if v_distinct_rows <> v_rows then
    raise exception 'Game Pass payload rejected: duplicate or missing IGDB ids';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as row_data(igdb_id bigint, name text)
    where row_data.igdb_id is null or nullif(btrim(row_data.name), '') is null
  ) then
    raise exception 'Game Pass payload rejected: every row needs an IGDB id and name';
  end if;

  select count(*) into v_previous_rows from public.gamepass;

  -- Supabase enables safe-update protection on API sessions, so retain an
  -- explicit predicate even though this intentionally replaces every row.
  delete from public.gamepass where true;

  insert into public.gamepass (
    igdb_id, name, cover, year, rating, released, leaving_soon, updated_at
  )
  select
    row_data.igdb_id,
    row_data.name,
    row_data.cover,
    row_data.year,
    row_data.rating,
    row_data.released,
    coalesce(row_data.leaving_soon, false),
    coalesce(row_data.updated_at, now())
  from jsonb_to_recordset(p_rows) as row_data(
    igdb_id bigint,
    name text,
    cover text,
    year integer,
    rating integer,
    released bigint,
    leaving_soon boolean,
    updated_at timestamptz
  );

  insert into public.sync_runs (games_seen, games_changed, status, note)
  values (v_rows, abs(v_rows - v_previous_rows), 'ok', 'gamepass-catalog');

  return jsonb_build_object(
    'status', 'ok',
    'rows', v_rows,
    'previousRows', v_previous_rows
  );
end;
$$;

revoke all on function public.replace_gamepass_catalog(jsonb, integer) from public;
revoke all on function public.replace_gamepass_catalog(jsonb, integer) from anon;
revoke all on function public.replace_gamepass_catalog(jsonb, integer) from authenticated;
grant execute on function public.replace_gamepass_catalog(jsonb, integer) to service_role;

comment on function public.replace_gamepass_catalog(jsonb, integer) is
  'Validates and atomically replaces the Game Pass catalog. Service-role only.';
