-- Realtime-Updates statt Polling für die Bewerbungsseite (Home, Kategorie-Detail,
-- Admin-Dashboard, OBS-Overlay, "Meine Bewerbungen"), analog zum Bingo-Feature.
-- Select ist bei allen drei Tabellen ohnehin öffentlich (using (true)), Realtime
-- gibt also niemandem Zugriff auf Daten, die er nicht schon per REST lesen könnte.
alter publication supabase_realtime add table categories, applications, live_round;
