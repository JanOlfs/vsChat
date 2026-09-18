import { Component, DestroyRef, effect, inject, input, resource, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BingoService } from '../../services/bingo.service';
import { AuthService } from '../../services/auth.service';
import { SupabaseService } from '../../services/supabase.service';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';
import { checkBingoWinner } from '../../utils/bingo-win';
import { AutoFitTextDirective } from '../../directives/auto-fit-text.directive';

// Realtime hält uns aktuell, das hier ist nur das Sicherheitsnetz falls eine
// Verbindung mal hängt (z.B. Laptop kurz im Standby).
const FALLBACK_POLL_INTERVAL_MS = 30000;

@Component({
  selector: 'app-bingo-play',
  imports: [AutoFitTextDirective],
  templateUrl: './bingo-play.html',
})
export class BingoPlay {
  private readonly bingoService = inject(BingoService);
  private readonly router = inject(Router);
  private readonly supabase = inject(SupabaseService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  protected readonly auth = inject(AuthService);

  readonly id = input.required<string>();

  protected readonly error = signal<string | null>(null);

  protected readonly board = resource({
    params: () => this.id(),
    loader: ({ params }) => this.bingoService.getBoard(params),
  });

  protected readonly cells = resource({
    params: () => this.id(),
    loader: ({ params }) => this.bingoService.getCells(params),
  });

  constructor() {
    // In einem effect(), weil das required input `id` beim Konstruktor-Lauf
    // noch keinen Wert hat, per onCleanup wird der Channel bei einer
    // id-Änderung oder Komponenten-Zerstörung sauber wieder abgebaut.
    effect((onCleanup) => {
      const boardId = this.id();
      const channel = this.supabase.client
        .channel(`bingo-play-${boardId}`)
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
    inject(DestroyRef).onDestroy(() => clearInterval(interval));

    // Sobald jemand (der Admin) zurück auf Setup gesetzt hat, folgt auch der
    // andere Spieler automatisch in den Anordnungsmodus, ohne selbst klicken
    // zu müssen.
    effect(() => {
      if (this.board.value()?.status === 'setup') {
        void this.router.navigate(['/bingo', this.id(), 'arrange']);
      }
    });

    // Wurde die Spielfläche (von wem auch immer) gelöscht, fliegt man zurück
    // zur Übersicht statt auf einer leeren Seite hängen zu bleiben.
    effect(() => {
      if (!this.board.isLoading() && this.board.value() === null) {
        void this.router.navigate(['/bingo']);
      }
    });
  }

  protected get winner() {
    return checkBingoWinner(this.cells.value() ?? []);
  }

  /** Admin-Aktion: Claims zurücksetzen, Status zurück auf Setup, dann selbst zum Anordnen wechseln. */
  protected async goToArrange(): Promise<void> {
    if (!(await this.confirmDialog.ask('Zurück zum Anordnen? Alle Claims auf dieser Spielfläche gehen dabei verloren.'))) {
      return;
    }
    this.error.set(null);
    try {
      await this.bingoService.resetBoard(this.id());
    } catch (err) {
      console.error(err);
      this.error.set('Konnte nicht zurückgesetzt werden.');
      return;
    }
    void this.router.navigate(['/bingo', this.id(), 'arrange']);
  }

  /** Admin-Aktion: nur die Claims löschen, Layout und Status (aktiv) bleiben, für eine schnelle Revanche. */
  protected async resetClaims(): Promise<void> {
    if (
      !(await this.confirmDialog.ask('Alle Claims auf dieser Spielfläche wirklich löschen? Das Board bleibt so angeordnet.'))
    ) {
      return;
    }
    this.error.set(null);
    try {
      await this.bingoService.clearClaims(this.id());
      this.cells.reload();
    } catch (err) {
      console.error(err);
      this.error.set('Konnte nicht zurückgesetzt werden.');
    }
  }

  protected get isPlayer(): boolean {
    const profile = this.auth.currentProfile();
    const board = this.board.value();
    if (!profile || !board) return false;
    return profile.id === board.created_by || profile.twitch_login.toLowerCase() === board.opponent_twitch_login.toLowerCase();
  }

  /** Klick auf eine leere Zelle claimt sie, Klick auf die eigene macht sie wieder neutral. */
  protected async claim(cell: { id: string; claimed_by: string | null }): Promise<void> {
    const profile = this.auth.currentProfile();
    const board = this.board.value();
    if (!profile || !board || board.status !== 'active' || !this.isPlayer || this.winner) {
      return;
    }
    if (cell.claimed_by && cell.claimed_by !== profile.id) {
      return; // fremder Claim, nicht anfassbar
    }

    this.error.set(null);
    try {
      if (cell.claimed_by === profile.id) {
        await this.bingoService.unclaimCell(cell.id);
      } else {
        await this.bingoService.claimCell(cell.id, profile.id);
      }
      this.cells.reload();
    } catch (err) {
      console.error(err);
      this.error.set('Feld konnte nicht geändert werden.');
      this.cells.reload();
    }
  }
}
