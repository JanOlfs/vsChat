import { Component, DestroyRef, computed, effect, inject, input, resource, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ImposterService } from '../../services/imposter.service';
import { AuthService } from '../../services/auth.service';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';
import { IMPOSTER_GAMES, currentRoundSummary, totalPoints } from '../../utils/imposter';
import type { ImposterResult } from '../../models/types';

// Realtime hält uns aktuell, das hier ist nur das Sicherheitsnetz falls eine
// Verbindung mal hängt (z.B. Laptop kurz im Standby).
const FALLBACK_POLL_INTERVAL_MS = 30000;

@Component({
  selector: 'app-imposter-game',
  imports: [RouterLink],
  templateUrl: './imposter-game.html',
})
export class ImposterGame {
  private readonly imposterService = inject(ImposterService);
  private readonly router = inject(Router);
  private readonly confirmDialog = inject(ConfirmDialogService);
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

  protected assignRoles(): Promise<void> {
    return this.run(() => this.imposterService.assignRoles(this.id()), 'Rollen konnten nicht verteilt werden.');
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

  protected vote(target: string | null): Promise<void> {
    return this.run(() => this.imposterService.vote(this.id(), target), 'Stimme konnte nicht abgegeben werden.');
  }

  protected async deleteGame(): Promise<void> {
    if (!(await this.confirmDialog.ask('Spiel samt allen Runden und Punkten löschen?'))) return;
    await this.run(() => this.imposterService.deleteGame(this.id()), 'Löschen fehlgeschlagen.');
  }
}
