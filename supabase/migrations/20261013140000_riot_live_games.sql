-- League-Anbindung für Imposter: Spieler hinterlegen ihre Riot IDs, der
-- Chatbot-Worker erkennt darüber laufende Spiele (Riot Spectator API), zeigt
-- die Champions an und trägt nach dem Spiel Sieg/Niederlage automatisch ein.

-- Generisch über game_key, damit später auch Konten für andere Spiele hier landen.
create table game_accounts (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  game_key    text not null,
  name        text not null, -- bei LoL die Riot ID "Name#TAG"
  external_id text,          -- bei LoL die PUUID, füllt der Chatbot-Worker
  status      text not null default 'pending' check (status in ('pending', 'ok', 'not_found')),
  created_at  timestamptz not null default now()
);

create unique index on game_accounts (game_key, lower(name));
create index on game_accounts (profile_id);

alter table game_accounts enable row level security;

-- Riot IDs sind ohnehin öffentlich (jeder sieht sie im Spiel).
create policy "game_accounts_select_all" on game_accounts for select using (true);

-- Eintragen nur für sich selbst, geprüft wird es vom Worker (service_role).
create policy "game_accounts_insert_own" on game_accounts
  for insert
  with check (profile_id = auth.uid() and status = 'pending' and external_id is null);

create policy "game_accounts_delete_own_or_admin" on game_accounts
  for delete
  using (
    profile_id = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
  );

-- Riot-API-Schlüssel. Der Entwicklungsschlüssel läuft alle 24h ab, deshalb
-- pflegt der Admin ihn im Frontend statt per `wrangler secret put`. Keine
-- einzige Policy: lesen kann ihn nur der Worker per service_role, schreiben
-- und den Status abfragen nur Admins über die Funktionen unten.
create table riot_api_key (
  id            int primary key default 1 check (id = 1),
  api_key       text not null,
  updated_at    timestamptz not null default now(),
  last_error    text,
  last_error_at timestamptz
);

alter table riot_api_key enable row level security;

create function set_riot_api_key(p_key text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_admin) then
    raise exception 'Nur Admins dürfen den Riot-Schlüssel setzen.';
  end if;
  if coalesce(trim(p_key), '') = '' then
    raise exception 'Schlüssel darf nicht leer sein.';
  end if;
  insert into riot_api_key (id, api_key) values (1, trim(p_key))
  on conflict (id) do update set api_key = excluded.api_key, updated_at = now(), last_error = null, last_error_at = null;
end;
$$;

-- Gibt nie den Schlüssel selbst zurück, nur wann er gesetzt wurde und ob Riot ihn zuletzt abgelehnt hat.
create function riot_api_key_status() returns table (updated_at timestamptz, last_error text, last_error_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_admin) then
    raise exception 'Nur Admins.';
  end if;
  return query select k.updated_at, k.last_error, k.last_error_at from riot_api_key k;
end;
$$;

grant execute on function set_riot_api_key(text) to authenticated;
grant execute on function riot_api_key_status() to authenticated;

-- Live-Spiel pro Runde. started_at dient dem Worker als Untergrenze, damit
-- er kein Spiel erwischt, das schon vor dem Verteilen der Rollen lief.
alter table imposter_rounds
  add column started_at        timestamptz not null default now(),
  add column riot_match_id     text,  -- z.B. "EUW1_7012345678", für den Ergebnis-Abruf
  add column riot_participants jsonb; -- alle 10 Spieler, Format siehe RiotParticipant in types.ts

alter publication supabase_realtime add table game_accounts;

-- Abstimmen mit erkanntem League-Spiel: erst wenn jeder Spieler der Runde einem
-- Ingame-Spieler zugeordnet ist (automatisch über game_accounts oder per Hand
-- durch den Admin), und nur für Spieler aus dem eigenen Ingame-Team. Ohne
-- erkanntes Spiel (riot_participants null) bleibt alles wie bisher.
create or replace function imposter_vote(p_game_id uuid, p_target uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_game  imposter_games;
  v_parts jsonb;
begin
  select * into v_game from imposter_games where id = p_game_id;
  if v_game.status is distinct from 'voting' then
    raise exception 'Gerade läuft keine Abstimmung.';
  end if;
  if p_target is null and v_game.paranoia_percent = 0 then
    raise exception 'Ohne Paranoia gibt es immer einen Imposter.';
  end if;
  if p_target = auth.uid() then
    raise exception 'Du kannst nicht für dich selbst stimmen.';
  end if;
  if p_target is not null and not exists (
    select 1 from imposter_roles where game_id = p_game_id and round = v_game.current_round and profile_id = p_target
  ) then
    raise exception 'Spieler ist nicht in dieser Runde.';
  end if;

  select riot_participants into v_parts from imposter_rounds where game_id = p_game_id and round = v_game.current_round;
  if v_parts is not null then
    if exists (
      select 1 from imposter_roles r
      where r.game_id = p_game_id and r.round = v_game.current_round
        and not exists (select 1 from jsonb_array_elements(v_parts) e where e->>'profile_id' = r.profile_id::text)
    ) then
      raise exception 'Der Admin muss erst alle Spieler ihrem Ingame-Spieler zuordnen.';
    end if;
    if p_target is not null and (
      select e->>'team_id' from jsonb_array_elements(v_parts) e where e->>'profile_id' = p_target::text limit 1
    ) is distinct from (
      select e->>'team_id' from jsonb_array_elements(v_parts) e where e->>'profile_id' = auth.uid()::text limit 1
    ) then
      raise exception 'Du kannst nur für Spieler aus deinem Team stimmen.';
    end if;
  end if;

  update imposter_roles set voted = true, vote_for = p_target
  where game_id = p_game_id and round = v_game.current_round and profile_id = auth.uid();
  if not found then
    raise exception 'Du spielst in dieser Runde nicht mit.';
  end if;

  update imposter_players set voted_round = v_game.current_round
  where game_id = p_game_id and profile_id = auth.uid();
end;
$$;

-- Ordnet der Admin einen Spieler per Hand einem Ingame-Spieler zu, wird die
-- Riot ID gleich als (schon geprüftes) Konto des Spielers gespeichert, damit
-- es ab der nächsten Runde automatisch klappt.
create policy "game_accounts_insert_admin" on game_accounts
  for insert
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));
