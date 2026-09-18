import { Component, DestroyRef, inject, input, resource, signal } from '@angular/core';
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
  }

  protected get winner() {
    return checkBingoWinner(this.cells.value() ?? []);
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
    if (!profile || !board || board.status !== 'active' || cell.claimed_by || !this.isPlayer) {
      return;
    }
    this.error.set(null);
    try {
      await this.bingoService.claimCell(cell.id, profile.id);
      this.cells.reload();
    } catch {
      this.error.set('Feld ist schon vergeben oder konnte nicht geclaimt werden.');
      this.cells.reload();
    }
  }
}
