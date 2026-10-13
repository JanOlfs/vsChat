import { Component, DestroyRef, computed, effect, inject, input, resource, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ImposterService } from '../../services/imposter.service';
import { AuthService } from '../../services/auth.service';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';
import { GameAccountService } from '../../services/game-account.service';
import { RiotLiveGame } from '../../shared/riot-live-game/riot-live-game';
import { IMPOSTER_GAMES, type RoundSummary, currentRoundSummary, totalPoints } from '../../utils/imposter';
import type { ImposterResult } from '../../models/types';

// Realtime hält uns aktuell, das hier ist nur das Sicherheitsnetz falls eine
// Verbindung mal hängt (z.B. Laptop kurz im Standby).
const FALLBACK_POLL_INTERVAL_MS = 30000;

function riotKeyProblemText(status: { last_error: string | null } | null): string | null {
  if (!status) return 'Es ist kein Riot-API-Schlüssel hinterlegt.';
  if (status.last_error) return 'Der Riot-API-Schlüssel ist abgelaufen oder ungültig.';
  return null;
}

@Component({
  selector: 'app-imposter-game',
  imports: [RouterLink, RiotLiveGame],
  templateUrl: './imposter-game.html',
})
export class ImposterGame {
  private readonly imposterService = inject(ImposterService);
  private readonly router = inject(Router);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly gameAccounts = inject(GameAccountService);
  protected readonly auth = inject(AuthService);

  readonly id = input.required<string>();

  protected readonly error = signal<string | null>(null);
  // Der Streamer spielt mit und sein Bildschirm ist live, deshalb ist die
  // Rollenkarte standardmäßig verdeckt.
  protected readonly showRole = signal(false);

  protected readonly state = resource({
    params: () => this.id(),
    loader: ({ params }) => this.imposterService.getState(params),
  });

  protected readonly gameDef = computed(() => {
    const key = this.state.value()?.game.game_key;
    return key ? IMPOSTER_GAMES[key] : undefined;
  });

  protected readonly isPlayer = computed(() => {
    const me = this.auth.currentProfile()?.id;
    return !!this.state.value()?.players.some((p) => p.profile_id === me);
  });

  protected readonly myRole = computed(() => {
    const s = this.state.value();
    const me = this.auth.currentProfile()?.id;
    if (!s || s.game.status === 'lobby') return undefined;
    return s.roles.find((r) => r.round === s.game.current_round && r.profile_id === me);
  });

  protected readonly scoreboard = computed(() => {
    const s = this.state.value();
    if (!s) return [];
    const totals = totalPoints(s);
    return s.players
      .map((p) => ({ player: p, points: totals.get(p.profile_id) ?? 0 }))
      .sort((a, b) => b.points - a.points);
  });

  protected readonly summary = computed(() => {
    const s = this.state.value();
    return s ? currentRoundSummary(s) : null;
  });

  /** Teilnehmer des League-Spiels der aktuellen Runde, sobald der Worker es erkannt hat. */
  protected readonly liveParticipants = computed(() => {
    const s = this.state.value();
    if (!s || s.game.status === 'lobby') return null;
    return s.rounds.find((r) => r.round === s.game.current_round)?.riot_participants ?? null;
  });

  // Nur für Admins bei LoL-Spielen, die RPC verweigert allen anderen ohnehin.
  protected readonly riotKeyStatus = resource({
    params: () =>
      this.auth.currentProfile()?.is_admin && this.state.value()?.game.game_key === 'lol' ? true : undefined,
    loader: () => this.gameAccounts.getRiotApiKeyStatus(),
  });

  /** Warnung vor dem Start einer Runde, null wenn der Schlüssel zuletzt funktioniert hat. */
  protected readonly riotKeyProblem = computed(() =>
    this.riotKeyStatus.hasValue() ? riotKeyProblemText(this.riotKeyStatus.value()) : null,
  );

  /** Spieler, die (noch) keinem Ingame-Spieler zugeordnet sind. Solange es welche gibt, ist die Abstimmung gesperrt. */
  protected readonly unmappedPlayers = computed(() => {
    const s = this.state.value();
    const participants = this.liveParticipants();
    if (!s || !participants) return [];
    return s.players.filter((p) => !participants.some((x) => x.profile_id === p.profile_id));
  });

  protected readonly unmappedNames = computed(() =>
    this.unmappedPlayers()
      .map((p) => p.profile.display_name)
      .join(', '),
  );

  /** Wählbar ist jeder andere Spieler, mit erkanntem League-Spiel aber nur aus dem eigenen Ingame-Team. */
  protected readonly voteTargets = computed(() => {
    const s = this.state.value();
    const me = this.auth.currentProfile()?.id;
    if (!s) return [];
    const others = s.players.filter((p) => p.profile_id !== me);
    const participants = this.liveParticipants();
    if (!participants) return others;
    const teamOf = (profileId: string | undefined) => participants.find((x) => x.profile_id === profileId)?.team_id;
    return others.filter((p) => teamOf(p.profile_id) === teamOf(me));
  });

  /** Anklickbare Kacheln im Live-Spiel: nur während der Abstimmung, nur Mitspieler, nur wenn alle zugeordnet sind. */
  protected readonly votableIds = computed(() =>
    this.state.value()?.game.status === 'voting' && this.myRole() && this.unmappedPlayers().length === 0
      ? this.voteTargets().map((p) => p.profile_id)
      : [],
  );

  protected readonly mySelection = computed(() => {
    const role = this.myRole();
    return role?.voted ? role.vote_for : null;
  });

  protected readonly votedCount = computed(() => {
    const s = this.state.value();
    return s ? s.players.filter((p) => p.voted_round === s.game.current_round).length : 0;
  });

  constructor() {
    effect((onCleanup) => onCleanup(this.imposterService.watch(this.id(), () => this.state.reload())));

    const interval = setInterval(() => this.state.reload(), FALLBACK_POLL_INTERVAL_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(interval));

    // Neue Runde: Karte wieder zudecken. Über ein computed, damit nicht jedes
    // Realtime-Reload (neues State-Objekt) die Karte zuklappt.
    const currentRound = computed(() => this.state.value()?.game.current_round);
    effect(() => {
      currentRound();
      this.showRole.set(false);
    });

    effect(() => {
      if (!this.state.isLoading() && this.state.value() === null) {
        void this.router.navigate(['/imposter']);
      }
    });
  }

  protected name(profileId: string | null): string {
    if (!profileId) return 'Kein Imposter';
    return this.state.value()?.players.find((p) => p.profile_id === profileId)?.profile.display_name ?? '(ausgestiegen)';
  }

  protected roleName(role: string): string {
    return this.gameDef()?.roles[role]?.name ?? role;
  }

  private async run(action: () => Promise<void>, failMessage: string): Promise<void> {
    this.error.set(null);
    try {
      await action();
      this.state.reload();
    } catch (err) {
      console.error(err);
      // P0001 = raise exception aus unseren RPCs, deren Texte sind schon für Menschen formuliert.
      const { code, message } = err as { code?: string; message?: string };
      this.error.set(code === 'P0001' && message ? message : failMessage);
    }
  }

  protected join(): Promise<void> {
    const me = this.auth.currentProfile()!.id;
    return this.run(() => this.imposterService.join(this.id(), me), 'Beitreten fehlgeschlagen (Spiel voll?).');
  }

  protected leave(): Promise<void> {
    const me = this.auth.currentProfile()!.id;
    return this.run(() => this.imposterService.removePlayer(this.id(), me), 'Verlassen fehlgeschlagen.');
  }

  protected async kick(profileId: string): Promise<void> {
    if (!(await this.confirmDialog.ask(`${this.name(profileId)} aus dem Spiel entfernen?`))) return;
    await this.run(() => this.imposterService.removePlayer(this.id(), profileId), 'Entfernen fehlgeschlagen.');
  }

  protected async assignRoles(): Promise<void> {
    // Frisch abfragen statt den Stand vom Seitenaufruf zu nehmen, der Worker prüft den Schlüssel laufend.
    if (this.state.value()?.game.game_key === 'lol') {
      this.error.set(null);
      let problem: string | null;
      try {
        problem = riotKeyProblemText(await this.gameAccounts.getRiotApiKeyStatus());
      } catch (err) {
        console.error(err);
        problem = 'Der Status des Riot-API-Schlüssels konnte nicht geprüft werden.';
      }
      this.riotKeyStatus.reload();
      if (problem && !(await this.confirmDialog.ask(`${problem} Das League-Spiel wird nicht erkannt. Trotzdem starten?`))) {
        return;
      }
    }
    return this.run(async () => {
      await this.imposterService.assignRoles(this.id());
      // Worker sofort nach dem League-Spiel suchen lassen statt erst beim nächsten Alarm.
      this.gameAccounts.pokeWorker();
    }, 'Rollen konnten nicht verteilt werden.');
  }

  /** Match vorbei: Ergebnis festhalten und Abstimmung öffnen. */
  protected finishMatch(result: ImposterResult): Promise<void> {
    const round = this.state.value()!.game.current_round;
    return this.run(async () => {
      await this.imposterService.setResult(this.id(), round, result);
      await this.imposterService.setStatus(this.id(), 'voting');
    }, 'Ergebnis konnte nicht gespeichert werden.');
  }

  protected async reveal(): Promise<void> {
    const s = this.state.value()!;
    const missing = s.players.length - this.votedCount();
    if (missing > 0 && !(await this.confirmDialog.ask(`${missing} Spieler haben noch nicht abgestimmt. Trotzdem auflösen?`))) {
      return;
    }
    await this.run(() => this.imposterService.setStatus(this.id(), 'revealed'), 'Auflösen fehlgeschlagen.');
  }

  protected roundRow(sum: RoundSummary, profileId: string) {
    return sum.rows.find((r) => r.profileId === profileId);
  }

  protected participantIndex(profileId: string): number {
    return this.liveParticipants()?.findIndex((x) => x.profile_id === profileId) ?? -1;
  }

  /** Admin: ordnet einen Spieler einem Ingame-Spieler zu (Index in riot_participants, '' = keiner). */
  protected assignParticipant(profileId: string, indexValue: string): Promise<void> {
    const s = this.state.value()!;
    const player = s.players.find((p) => p.profile_id === profileId)!;
    // Erst die alte Zuordnung des Spielers lösen, ein Spieler steckt immer in höchstens einem Ingame-Spieler.
    const updated = this.liveParticipants()!.map((x) =>
      x.profile_id === profileId ? { ...x, profile_id: null, twitch_name: null } : x,
    );
    const chosen = indexValue === '' ? null : Number(indexValue);
    if (chosen !== null) {
      updated[chosen] = { ...updated[chosen], profile_id: profileId, twitch_name: player.profile.display_name };
    }
    return this.run(async () => {
      await this.imposterService.setParticipants(this.id(), s.game.current_round, updated);
      // Riot ID als Konto merken, damit die Zuordnung ab der nächsten Runde automatisch klappt.
      const participant = chosen !== null ? updated[chosen] : null;
      if (participant?.puuid && participant.riot_id) {
        await this.gameAccounts.addVerified(profileId, 'lol', participant.riot_id, participant.puuid);
      }
    }, 'Zuordnung konnte nicht gespeichert werden.');
  }

  protected vote(target: string | null): Promise<void> {
    return this.run(() => this.imposterService.vote(this.id(), target), 'Stimme konnte nicht abgegeben werden.');
  }

  protected async deleteGame(): Promise<void> {
    if (!(await this.confirmDialog.ask('Spiel samt allen Runden und Punkten löschen?'))) return;
    await this.run(() => this.imposterService.deleteGame(this.id()), 'Löschen fehlgeschlagen.');
  }
}
