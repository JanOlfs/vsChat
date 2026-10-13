import { Component, DestroyRef, inject, resource, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ImposterService } from '../../services/imposter.service';
import { AuthService } from '../../services/auth.service';
import { SupabaseService } from '../../services/supabase.service';
import { IMPOSTER_GAMES } from '../../utils/imposter';

@Component({
  selector: 'app-imposter-list',
  imports: [RouterLink],
  templateUrl: './imposter-list.html',
})
export class ImposterList {
  private readonly imposterService = inject(ImposterService);
  private readonly router = inject(Router);
  private readonly supabase = inject(SupabaseService);
  protected readonly auth = inject(AuthService);

  protected readonly gameDefs = Object.entries(IMPOSTER_GAMES);
  protected readonly error = signal<string | null>(null);
  protected readonly paranoia = signal(false);

  protected readonly games = resource({ loader: () => this.imposterService.getGames() });

  constructor() {
    const channel = this.supabase.client
      .channel('imposter-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'imposter_games' }, () => this.games.reload())
      .subscribe();
    inject(DestroyRef).onDestroy(() => void this.supabase.client.removeChannel(channel));
  }

  protected gameName(key: string): string {
    return IMPOSTER_GAMES[key]?.name ?? key;
  }

  protected async createGame(
    event: Event,
    nameEl: HTMLInputElement,
    gameEl: HTMLSelectElement,
    paranoiaEl: HTMLInputElement,
  ): Promise<void> {
    event.preventDefault();
    this.error.set(null);

    const name = nameEl.value.trim();
    const gameKey = gameEl.value;
    const paranoiaPercent = this.paranoia() ? Number(paranoiaEl.value) : 0;
    const profileId = this.auth.currentProfile()?.id;
    if (!name || !profileId) {
      this.error.set('Name ist ein Pflichtfeld.');
      return;
    }
    if (!Number.isInteger(paranoiaPercent) || paranoiaPercent < 0 || paranoiaPercent > 100) {
      this.error.set('Paranoia muss zwischen 0 und 100 % liegen.');
      return;
    }

    try {
      const { id } = await this.imposterService.createGame({
        name,
        game_key: gameKey,
        max_players: IMPOSTER_GAMES[gameKey].maxPlayers,
        paranoia_percent: paranoiaPercent,
        created_by: profileId,
      });
      void this.router.navigate(['/imposter', id]);
    } catch (err) {
      console.error(err);
      this.error.set('Spiel konnte nicht angelegt werden.');
    }
  }
}
