-- Follow-up from the production security/performance advisor.

create index if not exists rank_comparisons_left_id_idx
  on public.rank_comparisons (left_id);
create index if not exists rank_comparisons_right_id_idx
  on public.rank_comparisons (right_id);

-- This older trigger predates the migration ledger. Qualify its table lookup so
-- its search path can be pinned without changing behavior.
create or replace function public.play_events_recompute_minutes_delta()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  prev_after integer;
begin
  if new.playtime_minutes_after is null then
    return new;
  end if;

  select p.playtime_minutes_after
    into prev_after
  from public.play_events p
  where p.master_id = new.master_id
    and p.event_date < new.event_date
    and p.playtime_minutes_after is not null
  order by p.event_date desc
  limit 1;

  if prev_after is null then
    return new;
  end if;

  new.minutes_delta := greatest(new.playtime_minutes_after - prev_after, 0);
  return new;
end;
$$;

-- A table with RLS and no policy is already default-deny. Make that intent
-- explicit for historical backups and service-only coordination tables so the
-- security advisor can distinguish deliberate locks from incomplete setup.
do $$
declare
  item record;
begin
  for item in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relrowsecurity
      and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
  loop
    execute format(
      'create policy service_only on %I.%I for all to anon, authenticated using (false) with check (false)',
      item.schema_name,
      item.table_name
    );
  end loop;
end;
$$;
