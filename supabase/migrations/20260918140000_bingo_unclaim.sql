-- Erlaubt, eine eigene geclaimte Zelle wieder freizugeben (Klick auf die
-- eigene Kachel schaltet sie zurück auf neutral). Fremde Claims bleiben
-- weiterhin unantastbar: USING lässt nur "noch leer" oder "von mir selbst"
-- durch, WITH CHECK erlaubt als neuen Wert nur "leer" oder "ich selbst".
drop policy "bingo_cells_claim" on bingo_cells;

create policy "bingo_cells_claim" on bingo_cells
  for update
  using (
    (claimed_by is null or claimed_by = auth.uid())
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
  with check (claimed_by is null or claimed_by = auth.uid());
