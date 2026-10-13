import { Component, DestroyRef, computed, effect, inject, input, resource } from '@angular/core';
import { ImposterService } from '../../services/imposter.service';
import { IMPOSTER_GAMES, currentRoundSummary, totalPoints } from '../../utils/imposter';

// Realtime hält uns aktuell, das hier ist nur das Sicherheitsnetz falls eine
// Verbindung mal hängt (z.B. der Rechner mit OBS kurz im Standby).
const FALLBACK_POLL_INTERVAL_MS = 30000;

/** Browser-Source für OBS, analog zu bingo-overlay.ts. Zeigt Rollen erst nach der Auflösung (RLS). */
@Component({
  selector: 'app-imposter-overlay',
  templateUrl: './imposter-overlay.html',
})
export class ImposterOverlay {
  private readonly imposterService = inject(ImposterService);

  readonly id = input.required<string>();

  protected readonly state = resource({
    params: () => this.id(),
    loader: ({ params }) => this.imposterService.getState(params),
  });

  protected readonly summary = computed(() => {
    const s = this.state.value();
    return s ? currentRoundSummary(s) : null;
  });

  protected readonly scoreboard = computed(() => {
    const s = this.state.value();
    if (!s) return [];
    const totals = totalPoints(s);
    return s.players
      .map((p) => ({ name: p.profile.display_name, profileId: p.profile_id, points: totals.get(p.profile_id) ?? 0 }))
      .sort((a, b) => b.points - a.points);
  });

  constructor() {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';

    effect((onCleanup) => onCleanup(this.imposterService.watch(this.id(), () => this.state.reload())));

    const interval = setInterval(() => this.state.reload(), FALLBACK_POLL_INTERVAL_MS);
    inject(DestroyRef).onDestroy(() => {
      document.documentElement.style.background = '';
      document.body.style.background = '';
      clearInterval(interval);
    });
  }

  protected name(profileId: string | null): string {
    if (!profileId) return 'Niemand';
    return this.state.value()?.players.find((p) => p.profile_id === profileId)?.profile.display_name ?? '?';
  }

  protected roleName(role: string): string {
    const key = this.state.value()?.game.game_key ?? '';
    return IMPOSTER_GAMES[key]?.roles[role]?.name ?? role;
  }
}
