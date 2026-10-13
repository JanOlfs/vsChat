-- Imposter-Modus: Spieler treten einem Spiel bei, pro Runde bekommt jeder
-- geheim eine Rolle (crew/imposter), nach dem Match wird abgestimmt und
-- aufgelöst. Generisch über game_key (verweist auf IMPOSTER_GAMES in
-- src/app/utils/imposter.ts), neue Spiele brauchen keine Migration.
--
-- Geheimhaltung: Der Streamer (Admin) spielt selbst mit, deshalb bekommen
-- auch Admins auf imposter_roles keine Sonderrechte. Jeder sieht nur seine
-- eigene Rolle, bis die Runde aufgelöst ist. Verteilen und Abstimmen laufen
-- über security-definer-Funktionen, nie über direkte Writes.

create table imposter_games (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  game_key         text not null,
  max_players      int not null check (max_players between 2 and 10),
  -- Wahrscheinlichkeit in Prozent, dass eine Runde ganz ohne Imposter läuft. 0 = aus.
  paranoia_percent int not null default 0 check (paranoia_percent between 0 and 100),
  status           text not null default 'lobby' check (status in ('lobby', 'playing', 'voting', 'revealed')),
  current_round    int not null default 0,
  created_by       uuid not null references profiles(id) on delete cascade,
  created_at       timestamptz not null default now()
);

create table imposter_players (
  game_id     uuid not null references imposter_games(id) on delete cascade,
  profile_id  uuid not null references profiles(id) on delete cascade,
  -- Öffentlich sichtbar, dass (nicht wofür) jemand in der aktuellen Runde abgestimmt hat.
  voted_round int not null default 0,
  joined_at   timestamptz not null default now(),
  primary key (game_id, profile_id)
);

create table imposter_rounds (
  game_id uuid not null references imposter_games(id) on delete cascade,
  round   int not null,
  result  text check (result in ('win', 'loss')),
  primary key (game_id, round)
);

create table imposter_roles (
  game_id    uuid not null,
  round      int not null,
  profile_id uuid not null references profiles(id) on delete cascade,
  role       text not null, -- bewusst ohne check, neue Rollen sollen keine Migration brauchen
  voted      boolean not null default false,
  vote_for   uuid references profiles(id) on delete set null, -- null + voted = "kein Imposter"
  primary key (game_id, round, profile_id),
  foreign key (game_id, round) references imposter_rounds(game_id, round) on delete cascade
);

-- Tipps aus dem Twitch-Chat (!sus <name>), geschrieben vom Chatbot per service_role.
create table imposter_chat_votes (
  game_id        uuid not null,
  round          int not null,
  twitch_user_id text not null,
  target_id      uuid not null references profiles(id) on delete cascade,
  primary key (game_id, round, twitch_user_id),
  foreign key (game_id, round) references imposter_rounds(game_id, round) on delete cascade
);

create function imposter_round_revealed(p_game_id uuid, p_round int) returns boolean
language sql stable as $$
  select exists (
    select 1 from imposter_games g
    where g.id = p_game_id and (p_round < g.current_round or g.status = 'revealed')
  );
$$;

alter table imposter_games enable row level security;
alter table imposter_players enable row level security;
alter table imposter_rounds enable row level security;
alter table imposter_roles enable row level security;
alter table imposter_chat_votes enable row level security;

create policy "imposter_games_select_all" on imposter_games for select using (true);
create policy "imposter_players_select_all" on imposter_players for select using (true);
create policy "imposter_rounds_select_all" on imposter_rounds for select using (true);

create policy "imposter_roles_select_own_or_revealed" on imposter_roles
  for select using (profile_id = auth.uid() or imposter_round_revealed(game_id, round));

create policy "imposter_chat_votes_select_revealed" on imposter_chat_votes
  for select using (imposter_round_revealed(game_id, round));

create policy "imposter_games_admin_all" on imposter_games
  for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));

-- Ergebnis (Sieg/Niederlage) trägt der Admin ein, Runden selbst legt nur die RPC an.
create policy "imposter_rounds_admin_update" on imposter_rounds
  for update
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));

-- Beitreten/Verlassen nur zwischen den Runden und nur für sich selbst.
create policy "imposter_players_join" on imposter_players
  for insert
  with check (
    profile_id = auth.uid()
    and voted_round = 0
    and exists (
      select 1 from imposter_games g
      where g.id = game_id
        and g.status in ('lobby', 'revealed')
        and (select count(*) from imposter_players p2 where p2.game_id = g.id) < g.max_players
    )
  );

create policy "imposter_players_leave" on imposter_players
  for delete
  using (
    (profile_id = auth.uid() and exists (
      select 1 from imposter_games g where g.id = game_id and g.status in ('lobby', 'revealed')
    ))
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
  );

-- Startet eine neue Runde und verteilt die Rollen zufällig. Die Funktion gibt
-- nichts zurück, damit auch der aufrufende Admin nichts über fremde Rollen erfährt.
create function imposter_assign_roles(p_game_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_game     imposter_games;
  v_round    int;
  v_imposter uuid;
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_admin) then
    raise exception 'Nur Admins dürfen Rollen verteilen.';
  end if;

  select * into v_game from imposter_games where id = p_game_id for update;
  if not found then
    raise exception 'Spiel nicht gefunden.';
  end if;
  if v_game.status not in ('lobby', 'revealed') then
    raise exception 'Rollen können nur in der Lobby oder nach der Auflösung verteilt werden.';
  end if;
  -- 2 statt 3, damit sich das mit einem Zweitaccount testen lässt.
  if (select count(*) from imposter_players where game_id = p_game_id) < 2 then
    raise exception 'Mindestens 2 Spieler nötig.';
  end if;

  v_round := v_game.current_round + 1;
  insert into imposter_rounds (game_id, round) values (p_game_id, v_round);

  -- Paranoia: mit paranoia_percent Prozent Wahrscheinlichkeit bleibt v_imposter null.
  if random() * 100 >= v_game.paranoia_percent then
    select profile_id into v_imposter from imposter_players where game_id = p_game_id order by random() limit 1;
  end if;

  insert into imposter_roles (game_id, round, profile_id, role)
  select p_game_id, v_round, profile_id, case when profile_id = v_imposter then 'imposter' else 'crew' end
  from imposter_players
  where game_id = p_game_id;

  update imposter_games set current_round = v_round, status = 'playing' where id = p_game_id;
end;
$$;

-- p_target null = "kein Imposter", nur erlaubt wenn Paranoia an ist. Bis zur
-- Auflösung darf man umentscheiden.
create function imposter_vote(p_game_id uuid, p_target uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_game imposter_games;
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

  update imposter_roles set voted = true, vote_for = p_target
  where game_id = p_game_id and round = v_game.current_round and profile_id = auth.uid();
  if not found then
    raise exception 'Du spielst in dieser Runde nicht mit.';
  end if;

  update imposter_players set voted_round = v_game.current_round
  where game_id = p_game_id and profile_id = auth.uid();
end;
$$;

grant execute on function imposter_assign_roles(uuid) to authenticated;
grant execute on function imposter_vote(uuid, uuid) to authenticated;

-- Realtime respektiert RLS, fremde Rollen kommen vor der Auflösung also nicht durch.
alter publication supabase_realtime add table
  imposter_games, imposter_players, imposter_rounds, imposter_roles, imposter_chat_votes;
