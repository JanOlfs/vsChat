-- Optionales Bannerbild pro Kategorie (URL, kein eigener Upload/Storage-Bucket
-- für so ein einzelnes Feld nötig), wird auf der Startseite neben der Kategorie
-- angezeigt.
alter table categories add column banner_url text;
