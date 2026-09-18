import { Component, DestroyRef, effect, inject, input, resource } from '@angular/core';
import { BingoService } from '../../services/bingo.service';
import { SupabaseService } from '../../services/supabase.service';
import { checkBingoWinner } from '../../utils/bingo-win';
import { AutoFitTextDirective } from '../../directives/auto-fit-text.directive';

// Realtime hält uns aktuell, das hier ist nur das Sicherheitsnetz falls eine
// Verbindung mal hängt (z.B. der Rechner mit OBS kurz im Standby).
const FALLBACK_POLL_INTERVAL_MS = 30000;

/** Browser-Source für OBS, analog zu overlay.ts: transparenter Hintergrund, kein Shell-Layout. */
@Component({
  selector: 'app-bingo-overlay',
  imports: [AutoFitTextDirective],
  templateUrl: './bingo-overlay.html',
})
export class BingoOverlay {
  private readonly bingoService = inject(BingoService);
  private readonly supabase = inject(SupabaseService);

  readonly id = input.required<string>();

  protected readonly board = resource({
    params: () => this.id(),
    loader: ({ params }) => this.bingoService.getBoard(params),
  });

  protected readonly cells = resource({
    params: () => this.id(),
    loader: ({ params }) => this.bingoService.getCells(params),
  });

  protected get winner() {
    return checkBingoWinner(this.cells.value() ?? []);
  }

  constructor() {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';

    // In einem effect(), weil das required input `id` beim Konstruktor-Lauf
    // noch keinen Wert hat, per onCleanup wird der Channel bei einer
    // id-Änderung oder Komponenten-Zerstörung sauber wieder abgebaut.
    effect((onCleanup) => {
      const boardId = this.id();
      const channel = this.supabase.client
        .channel(`bingo-overlay-${boardId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'bingo_boards', filter: `id=eq.${boardId}` },
          () => this.board.reload(),
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'bingo_cells', filter: `board_id=eq.${boardId}` },
          () => this.cells.reload(),
        )
        .subscribe();
      onCleanup(() => void this.supabase.client.removeChannel(channel));
    });

    const interval = setInterval(() => {
      this.board.reload();
      this.cells.reload();
    }, FALLBACK_POLL_INTERVAL_MS);

    inject(DestroyRef).onDestroy(() => {
      document.documentElement.style.background = '';
      document.body.style.background = '';
      clearInterval(interval);
    });
  }
}
