-- Realtime-Updates statt Polling für Bingo-Übersicht/Anordnen/Spielen.
-- Select ist bei allen drei Tabellen ohnehin öffentlich (using (true)), Realtime
-- gibt also niemandem Zugriff auf Daten, die er nicht schon per REST lesen könnte.
alter publication supabase_realtime add table bingo_boards, bingo_categories, bingo_cells;
