-- GameDeck is a single-owner application. Keep the existing Auth user, but
-- reject every future user insertion regardless of which Auth endpoint is used.
create or replace function public.block_new_gamedeck_auth_user()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'New account creation is disabled for GameDeck';
end;
$$;

revoke all on function public.block_new_gamedeck_auth_user() from public, anon, authenticated;

drop trigger if exists block_new_gamedeck_auth_user on auth.users;

create trigger block_new_gamedeck_auth_user
before insert on auth.users
for each row
execute function public.block_new_gamedeck_auth_user();
