-- Start/Reset/Löschen einer Spielfläche bleibt Admin-Sache, nicht der Gegner.
-- Das Anordnen (Kategorien/Zellen) bleibt für beide, siehe vorherige Migration.
drop policy if exists "bingo_boards_opponent_update" on bingo_boards;

-- Eine Kategorie darf nur an einer Stelle auf dem Board liegen. Erlaubt trotzdem
-- beliebig viele leere Zellen gleichzeitig (Postgres behandelt NULL in einem
-- unique-Constraint als paarweise verschieden, nicht als Duplikat).
alter table bingo_cells add constraint bingo_cells_board_category_unique unique (board_id, category_id);
