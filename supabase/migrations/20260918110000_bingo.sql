-- Lockout Bingo: separates Feature, nutzt aber Profile/Twitch-Login und das
-- bestehende is_admin-Flag weiter (kein neues Rollensystem).
--
-- Eine "Spielfläche" (bingo_boards) hat einen Kategorien-Pool (bingo_categories)
-- und ein festes 5x5-Raster (bingo_cells, Position 0-24), auf das der Admin
-- Kategorien aus dem Pool zieht. Sobald die Spielfläche "active" ist, können
-- Admin und der eingetragene Gegner Felder für sich claimen (lockout: ein Feld
-- kann pro Person nur einmal vergeben werden, erzwungen über die RLS-Policy
-- unten, nicht nur im Frontend, damit Gleichzeitigkeit sauber bleibt).

create table bingo_boards (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  opponent_twitch_login text not null,
  status                text not null default 'setup' check (status in ('setup', 'active', 'finished')),
  created_by            uuid not null references profiles(id) on delete cascade,
  created_at            timestamptz not null default now()
);

create table bingo_categories (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references bingo_boards(id) on delete cascade,
  label      text not null,
  created_at timestamptz not null default now()
);

create table bingo_cells (
  id          uuid primary key default gen_random_uuid(),
  board_id    uuid not null references bingo_boards(id) on delete cascade,
  position    int not null check (position between 0 and 24),
  category_id uuid references bingo_categories(id) on delete set null,
  claimed_by  uuid references profiles(id) on delete set null,
  claimed_at  timestamptz,
  unique (board_id, position)
);

create index on bingo_categories (board_id);
create index on bingo_cells (board_id);

alter table bingo_boards enable row level security;
alter table bingo_categories enable row level security;
alter table bingo_cells enable row level security;

-- Lesen ist öffentlich (wie der Rest der Seite), das Overlay braucht keinen
-- Login. Das Board ist während des Streams eh öffentlich sichtbar.
create policy "bingo_boards_select_all" on bingo_boards for select using (true);
create policy "bingo_categories_select_all" on bingo_categories for select using (true);
create policy "bingo_cells_select_all" on bingo_cells for select using (true);

-- Admin verwaltet Spielflächen, Kategorien-Pool und die Board-Anordnung komplett.
create policy "bingo_boards_admin_all" on bingo_boards
  for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));

create policy "bingo_categories_admin_all" on bingo_categories
  for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));

create policy "bingo_cells_admin_arrange" on bingo_cells
  for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));

-- Lockout-Claim: nur die zwei Spieler (Admin/Ersteller + der per Twitch-Login
-- eingetragene Gegner), nur auf einer aktiven Spielfläche, nur wenn das Feld
-- noch niemandem gehört, und man kann nur sich selbst eintragen.
create policy "bingo_cells_claim" on bingo_cells
  for update
  using (
    claimed_by is null
    and exists (
      select 1 from bingo_boards b
      where b.id = board_id
        and b.status = 'active'
        and (
          b.created_by = auth.uid()
          or exists (
            select 1 from profiles p
            where p.id = auth.uid() and lower(p.twitch_login) = lower(b.opponent_twitch_login)
          )
        )
    )
  )
  with check (claimed_by = auth.uid());
