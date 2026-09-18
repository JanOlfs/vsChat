import { Component, DestroyRef, inject, resource, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BingoService } from '../../services/bingo.service';
import { AuthService } from '../../services/auth.service';
import { SupabaseService } from '../../services/supabase.service';
import type { BingoBoard } from '../../models/types';

// Realtime hält uns aktuell, das hier ist nur das Sicherheitsnetz falls eine
// Verbindung mal hängt (z.B. Laptop kurz im Standby).
const FALLBACK_POLL_INTERVAL_MS = 30000;

@Component({
  selector: 'app-bingo-list',
  templateUrl: './bingo-list.html',
})
export class BingoList {
  private readonly bingoService = inject(BingoService);
  private readonly router = inject(Router);
  private readonly supabase = inject(SupabaseService);
  protected readonly auth = inject(AuthService);

  protected readonly error = signal<string | null>(null);

  protected readonly boards = resource({
    params: () => {
      const profile = this.auth.currentProfile();
      return profile ? { profileId: profile.id, twitchLogin: profile.twitch_login } : undefined;
    },
    loader: ({ params }) => this.bingoService.getMyBoards(params.profileId, params.twitchLogin),
  });

  constructor() {
    // Damit auch Leute, die schon auf der Übersicht sitzen, mitbekommen, wenn
    // anderswo eine Spielfläche angelegt oder gelöscht wird.
    const channel = this.supabase.client
      .channel('bingo-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bingo_boards' }, () => this.boards.reload())
      .subscribe();
    const interval = setInterval(() => this.boards.reload(), FALLBACK_POLL_INTERVAL_MS);

    inject(DestroyRef).onDestroy(() => {
      clearInterval(interval);
      void this.supabase.client.removeChannel(channel);
    });
  }

  /** Solange die Spielfläche im Setup ist, geht's zum Anordnen, danach zum Spielen. */
  protected goToBoard(board: BingoBoard): void {
    const segment = board.status === 'setup' ? 'arrange' : 'play';
    void this.router.navigate(['/bingo', board.id, segment]);
  }

  protected async createBoard(event: Event, nameEl: HTMLInputElement, opponentEl: HTMLInputElement): Promise<void> {
    event.preventDefault();
    this.error.set(null);

    const name = nameEl.value.trim();
    const opponent = opponentEl.value.trim();
    if (!name || !opponent) {
      this.error.set('Name und Gegner-Twitch-Login sind Pflichtfelder.');
      return;
    }
    const profileId = this.auth.currentProfile()?.id;
    if (!profileId) {
      this.error.set('Nicht eingeloggt.');
      return;
    }

    try {
      await this.bingoService.createBoard(name, opponent, profileId);
      nameEl.value = '';
      opponentEl.value = '';
      this.boards.reload();
    } catch (err) {
      console.error(err);
      this.error.set('Spielfläche konnte nicht angelegt werden.');
    }
  }
}
