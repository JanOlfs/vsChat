import { Component, computed, input } from '@angular/core';
import type { RiotParticipant } from '../../models/types';

/** Beide Teams eines laufenden League-Spiels: Champion-Bild, Ingame-Name, (Twitch-Name). */
@Component({
  selector: 'app-riot-live-game',
  templateUrl: './riot-live-game.html',
})
export class RiotLiveGame {
  readonly participants = input.required<RiotParticipant[]>();

  protected readonly teams = computed(() => {
    const byTeam = new Map<number, RiotParticipant[]>();
    for (const p of this.participants()) {
      byTeam.set(p.team_id, [...(byTeam.get(p.team_id) ?? []), p]);
    }
    return [...byTeam].sort(([a], [b]) => a - b).map(([teamId, players]) => ({ teamId, players }));
  });

  protected gameName(riotId: string): string {
    return riotId.split('#')[0] || 'Unbekannt';
  }
}
