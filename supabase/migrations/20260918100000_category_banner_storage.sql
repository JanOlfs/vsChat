-- Storage-Bucket für hochgeladene Bannerbilder. Public, weil die Kategorien-
-- übersicht ohnehin öffentlich ist, kein Signed-URL-Aufwand nötig.
insert into storage.buckets (id, name, public)
values ('category-banners', 'category-banners', true)
on conflict (id) do nothing;

create policy "category_banners_insert_admin" on storage.objects
  for insert
  with check (
    bucket_id = 'category-banners'
    and exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin)
  );
