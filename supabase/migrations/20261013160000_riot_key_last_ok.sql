-- Riot verrät nicht, wann ein Schlüssel abläuft. Statt das zu schätzen, merkt
-- sich der Worker, wann Riot den Schlüssel zuletzt akzeptiert hat.
alter table riot_api_key add column last_ok_at timestamptz;

-- Neuer Rückgabetyp, deshalb drop statt create or replace.
drop function riot_api_key_status();

create function riot_api_key_status()
returns table (updated_at timestamptz, last_ok_at timestamptz, last_error text, last_error_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_admin) then
    raise exception 'Nur Admins.';
  end if;
  return query select k.updated_at, k.last_ok_at, k.last_error, k.last_error_at from riot_api_key k;
end;
$$;

grant execute on function riot_api_key_status() to authenticated;

-- Neuer Schlüssel: alter Prüfstand gilt nicht mehr.
create or replace function set_riot_api_key(p_key text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_admin) then
    raise exception 'Nur Admins dürfen den Riot-Schlüssel setzen.';
  end if;
  if coalesce(trim(p_key), '') = '' then
    raise exception 'Schlüssel darf nicht leer sein.';
  end if;
  insert into riot_api_key (id, api_key) values (1, trim(p_key))
  on conflict (id) do update
    set api_key = excluded.api_key, updated_at = now(), last_ok_at = null, last_error = null, last_error_at = null;
end;
$$;
