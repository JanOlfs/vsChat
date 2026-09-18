-- Verschieben/Tauschen einer platzierten Kachel lief bisher über 2-3 einzelne,
-- nacheinander abgewartete Updates (RLS erlaubt keine zwei Felder mit
-- derselben Kategorie gleichzeitig, daher erst leeren, dann setzen). Das
-- fühlte sich beim Ziehen laggy an (mehrere Roundtrips) und flackerte kurz
-- über Realtime, weil jedes Update einzeln committet wurde.
--
-- Diese Funktion macht alle nötigen Updates in einer einzigen Transaktion.
-- security invoker (Standard) heißt: läuft weiter unter den Rechten des
-- aufrufenden Users, die bestehende RLS-Policy bingo_cells_admin_arrange
-- greift also unverändert (nur Admin darf).
create or replace function bingo_place_category(
  p_target_cell_id uuid,
  p_category_id uuid,
  p_source_cell_id uuid default null
) returns void
language plpgsql
as $$
declare
  v_target_old_category uuid;
begin
  if p_source_cell_id is not null then
    select category_id into v_target_old_category from bingo_cells where id = p_target_cell_id;

    -- Ziel erst leeren, dann die alte Zielkategorie auf die Quelle, sonst
    -- würde der unique(board_id, category_id)-Constraint kurzzeitig verletzt.
    update bingo_cells set category_id = null where id = p_target_cell_id;
    update bingo_cells set category_id = v_target_old_category where id = p_source_cell_id;
  end if;

  update bingo_cells set category_id = p_category_id where id = p_target_cell_id;
end;
$$;

grant execute on function bingo_place_category(uuid, uuid, uuid) to authenticated;
