-- Admin-Rolle für die Kategorienverwaltung. Kein separates Rollensystem, nur
-- ein Flag am eigenen Profil, für ein Ein-Personen-/Kleinteam-Projekt reicht das.

alter table profiles add column is_admin boolean not null default false;

create policy "categories_insert_admin" on categories
  for insert
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));

create policy "categories_update_admin" on categories
  for update
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));

-- Kein Delete, Kategorien löschen ist nicht Teil des Admin-Panels (kaskadiert
-- sonst alle Bewerbungen dieser Kategorie), bewusst weggelassen.
