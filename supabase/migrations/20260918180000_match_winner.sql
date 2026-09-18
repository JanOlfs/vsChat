-- Bisher wurde nur festgehalten, wer sich per Chat-Voting als Gegner
-- qualifiziert hat, nicht wer das eigentliche Match gegen den Streamer dann
-- gewonnen hat. Der Admin trägt das Ergebnis nachträglich im Frontend ein.
alter table matches add column winner text check (winner is null or winner in ('streamer', 'challenger'));

create policy "matches_update_admin" on matches
  for update
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));

alter publication supabase_realtime add table matches;
