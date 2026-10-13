import { Component, computed, input, output } from '@angular/core';
import type { RiotParticipant } from '../../models/types';

/**
 * Beide Teams eines League-Spiels: Champion-Bild, Ingame-Name, (Twitch-Name),
 * nach Spielende K/D/A und Sieg/Niederlage. In der Abstimmung sind die
 * wählbaren Mitspieler anklickbar.
 */
@Component({
  selector: 'app-riot-live-game',
  templateUrl: './riot-live-game.html',
})
export class RiotLiveGame {
  readonly participants = input.required<RiotParticipant[]>();
  /** profile_ids, die gerade angeklickt werden dürfen (leer = keine Abstimmung). */
  readonly votable = input<string[]>([]);
  /** Aktuell gewählte profile_id, wird hervorgehoben. */
  readonly selected = input<string | null>(null);
  /** Eigene profile_id, die Kachel bekommt einen blauen Rahmen. Im Overlay leer. */
  readonly me = input<string | null>(null);
  readonly pick = output<string>();

  protected readonly teams = computed(() => {
    const byTeam = new Map<number, RiotParticipant[]>();
    for (const p of this.participants()) {
      byTeam.set(p.team_id, [...(byTeam.get(p.team_id) ?? []), p]);
    }
    return [...byTeam]
      .sort(([a], [b]) => a - b)
      .map(([teamId, players]) => ({ teamId, players, win: players[0]?.win }));
  });

  protected gameName(riotId: string): string {
    return riotId.split('#')[0] || 'Unbekannt';
  }

  protected isVotable(p: RiotParticipant): boolean {
    return !!p.profile_id && this.votable().includes(p.profile_id);
  }
}
