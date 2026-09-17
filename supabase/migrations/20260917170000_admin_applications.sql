-- Erlaubt Admins, einzelne Bewerbungen zu entfernen oder eine ganze Kategorie
-- zurückzusetzen (alle Bewerbungen löschen). Deckt beides ab, weil DELETE-Policies
-- pro Zeile gelten, ein Bulk-Delete über category_id trifft dieselbe Policy.

create policy "applications_delete_admin" on applications
  for delete
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));
