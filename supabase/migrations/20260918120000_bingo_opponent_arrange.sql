-- Nicht nur der Admin (Ersteller), auch der eingetragene Gegner darf die
-- Spielfläche anordnen, solange sie noch im Setup ist, und sie starten.
-- ponytail: kein Schutz gegen absichtlich manipulierte Rohanfragen, die z.B.
-- claimed_by über diesen Weg setzen wollen (claimed_by is null im Check
-- verhindert das zumindest), reicht für ein freundschaftliches 2-Spieler-Spiel.

create policy "bingo_categories_opponent_setup" on bingo_categories
  for all
  using (
    exists (
      select 1 from bingo_boards b
      join profiles p on p.id = auth.uid()
      where b.id = board_id and b.status = 'setup' and lower(p.twitch_login) = lower(b.opponent_twitch_login)
    )
  )
  with check (
    exists (
      select 1 from bingo_boards b
      join profiles p on p.id = auth.uid()
      where b.id = board_id and b.status = 'setup' and lower(p.twitch_login) = lower(b.opponent_twitch_login)
    )
  );

create policy "bingo_cells_opponent_arrange" on bingo_cells
  for update
  using (
    claimed_by is null
    and exists (
      select 1 from bingo_boards b
      join profiles p on p.id = auth.uid()
      where b.id = board_id and b.status = 'setup' and lower(p.twitch_login) = lower(b.opponent_twitch_login)
    )
  )
  with check (
    claimed_by is null
    and exists (
      select 1 from bingo_boards b
      join profiles p on p.id = auth.uid()
      where b.id = board_id and b.status = 'setup' and lower(p.twitch_login) = lower(b.opponent_twitch_login)
    )
  );

create policy "bingo_boards_opponent_update" on bingo_boards
  for update
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and lower(p.twitch_login) = lower(opponent_twitch_login))
  )
  with check (
    exists (select 1 from profiles p where p.id = auth.uid() and lower(p.twitch_login) = lower(opponent_twitch_login))
  );
