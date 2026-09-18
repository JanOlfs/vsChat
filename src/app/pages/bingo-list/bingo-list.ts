import { Component, inject, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BingoService } from '../../services/bingo.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-bingo-list',
  imports: [RouterLink],
  templateUrl: './bingo-list.html',
})
export class BingoList {
  private readonly bingoService = inject(BingoService);
  protected readonly auth = inject(AuthService);

  protected readonly error = signal<string | null>(null);

  protected readonly boards = resource({
    params: () => {
      const profile = this.auth.currentProfile();
      return profile ? { profileId: profile.id, twitchLogin: profile.twitch_login } : undefined;
    },
    loader: ({ params }) => this.bingoService.getMyBoards(params.profileId, params.twitchLogin),
  });

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
