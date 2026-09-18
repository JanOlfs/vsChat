import { Component, DestroyRef, effect, inject, input, resource, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BingoService } from '../../services/bingo.service';
import { AuthService } from '../../services/auth.service';
import { checkBingoWinner } from '../../utils/bingo-win';

const POLL_INTERVAL_MS = 2000;

@Component({
  selector: 'app-bingo-play',
  templateUrl: './bingo-play.html',
})
export class BingoPlay {
  private readonly bingoService = inject(BingoService);
  private readonly router = inject(Router);
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
    const interval = setInterval(() => {
      this.board.reload();
      this.cells.reload();
    }, POLL_INTERVAL_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(interval));

    // Sobald jemand (der Admin) zurück auf Setup gesetzt hat, folgt auch der
    // andere Spieler automatisch in den Anordnungsmodus, ohne selbst klicken
    // zu müssen.
    effect(() => {
      if (this.board.value()?.status === 'setup') {
        void this.router.navigate(['/bingo', this.id(), 'arrange']);
      }
    });
  }

  protected get winner() {
    return checkBingoWinner(this.cells.value() ?? []);
  }

  /** Admin-Aktion: Claims zurücksetzen, Status zurück auf Setup, dann selbst zum Anordnen wechseln. */
  protected async goToArrange(): Promise<void> {
    if (!confirm('Zurück zum Anordnen? Alle Claims auf dieser Spielfläche gehen dabei verloren.')) {
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
    if (!confirm('Alle Claims auf dieser Spielfläche wirklich löschen? Das Board bleibt so angeordnet.')) {
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

  protected async claim(cell: { id: string; claimed_by: string | null }): Promise<void> {
    const profile = this.auth.currentProfile();
    const board = this.board.value();
    if (!profile || !board || board.status !== 'active' || cell.claimed_by || !this.isPlayer || this.winner) {
      return;
    }
    this.error.set(null);
    try {
      await this.bingoService.claimCell(cell.id, profile.id);
      this.cells.reload();
    } catch (err) {
      console.error(err);
      this.error.set('Feld ist schon vergeben oder konnte nicht geclaimt werden.');
      this.cells.reload();
    }
  }
}
