import { Component, DestroyRef, inject, input, resource } from '@angular/core';
import { BingoService } from '../../services/bingo.service';
import { checkBingoWinner } from '../../utils/bingo-win';

const POLL_INTERVAL_MS = 2000;

/** Browser-Source für OBS, analog zu overlay.ts: transparenter Hintergrund, kein Shell-Layout. */
@Component({
  selector: 'app-bingo-overlay',
  templateUrl: './bingo-overlay.html',
})
export class BingoOverlay {
  private readonly bingoService = inject(BingoService);

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

    const interval = setInterval(() => {
      this.board.reload();
      this.cells.reload();
    }, POLL_INTERVAL_MS);

    inject(DestroyRef).onDestroy(() => {
      document.documentElement.style.background = '';
      document.body.style.background = '';
      clearInterval(interval);
    });
  }
}
