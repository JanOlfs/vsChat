-- Admin soll Testeinträge/Fehlbuchungen in matches wieder löschen können.
create policy "matches_delete_admin" on matches
  for delete
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));
