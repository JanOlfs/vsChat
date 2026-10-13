import type { ImposterGame, ImposterResult, ImposterRole, ImposterState } from '../models/types';

export interface ImposterGameDef {
  name: string;
  maxPlayers: number;
  /** Rollenbeschreibung pro Rolle (Schlüssel = imposter_roles.role), spielspezifisch formuliert. */
  roles: Record<string, { name: string; description: string }>;
}

/** Neues Spiel = neuer Eintrag hier, die DB kennt nur game_key. */
export const IMPOSTER_GAMES: Record<string, ImposterGameDef> = {
  lol: {
    name: 'League of Legends',
    maxPlayers: 5,
    roles: {
      crew: {
        name: 'Crew',
        description: 'Gewinnt das Spiel und findet heraus, wer euch sabotiert.',
      },
      imposter: {
        name: 'Imposter',
        description:
          'Sorg dafür, dass dein Team verliert, ohne dass es jemand merkt. Kein offensichtliches Inten, kein AFK.',
      },
    },
  },
};

export const IMPOSTER_POINTS = {
  crewWin: 2,
  crewCorrectVote: 1,
  // Nur wenn der Imposter nicht erkannt wurde, erkannt gibt es immer 0.
  imposterLossUndetected: 5,
  imposterWinUndetected: 1,
};

export function isRoundRevealed(game: ImposterGame, round: number): boolean {
  return round < game.current_round || game.status === 'revealed';
}

/**
 * Punkte einer aufgelösten Runde pro Spieler. Ohne Imposter (Paranoia) ist
 * "kein Imposter" der richtige Tipp, deshalb der direkte Vergleich mit null.
 */
export function scoreRound(roles: ImposterRole[], result: ImposterResult | null): Map<string, number> {
  const imposter = roles.find((r) => r.role === 'imposter')?.profile_id ?? null;
  // Erkannt = der Imposter hat allein die meisten Stimmen, ein Gleichstand an der Spitze reicht nicht.
  // Seine eigene Stimme zählt mit, er kann sie also nutzen, um jemand anderen gleichzuziehen.
  const tally = new Map<string | null, number>();
  for (const r of roles) {
    if (r.voted) tally.set(r.vote_for, (tally.get(r.vote_for) ?? 0) + 1);
  }
  const imposterVotes = tally.get(imposter) ?? 0;
  const detected = imposterVotes > 0 && [...tally].every(([target, count]) => target === imposter || count < imposterVotes);
  const points = new Map<string, number>();
  for (const r of roles) {
    if (r.role === 'imposter') {
      const undetected =
        result === 'loss' ? IMPOSTER_POINTS.imposterLossUndetected : result === 'win' ? IMPOSTER_POINTS.imposterWinUndetected : 0;
      points.set(r.profile_id, detected ? 0 : undetected);
    } else {
      points.set(
        r.profile_id,
        (result === 'win' ? IMPOSTER_POINTS.crewWin : 0) +
          (r.voted && r.vote_for === imposter ? IMPOSTER_POINTS.crewCorrectVote : 0),
      );
    }
  }
  return points;
}

/** Gesamtpunkte über alle aufgelösten Runden. */
export function totalPoints(state: ImposterState): Map<string, number> {
  const totals = new Map<string, number>();
  for (const round of state.rounds) {
    if (!isRoundRevealed(state.game, round.round)) continue;
    const roles = state.roles.filter((r) => r.round === round.round);
    for (const [profileId, points] of scoreRound(roles, round.result)) {
      totals.set(profileId, (totals.get(profileId) ?? 0) + points);
    }
  }
  return totals;
}

export interface RoundSummary {
  result: ImposterResult | null;
  imposterId: string | null;
  rows: { profileId: string; role: string; voted: boolean; voteFor: string | null; points: number }[];
  /** Chat-Tipps pro Spieler (profile_id -> Anzahl). */
  chat: Map<string, number>;
  chatTotal: number;
}

/** Auflösung der aktuellen Runde, null solange sie noch geheim ist. */
export function currentRoundSummary(state: ImposterState): RoundSummary | null {
  const { game } = state;
  if (game.status !== 'revealed' || game.current_round === 0) return null;
  const roles = state.roles.filter((r) => r.round === game.current_round);
  const result = state.rounds.find((r) => r.round === game.current_round)?.result ?? null;
  const points = scoreRound(roles, result);
  const chatVotes = state.chatVotes.filter((v) => v.round === game.current_round);
  const chat = new Map<string, number>();
  for (const v of chatVotes) chat.set(v.target_id, (chat.get(v.target_id) ?? 0) + 1);
  return {
    result,
    imposterId: roles.find((r) => r.role === 'imposter')?.profile_id ?? null,
    rows: roles.map((r) => ({
      profileId: r.profile_id,
      role: r.role,
      voted: r.voted,
      voteFor: r.vote_for,
      points: points.get(r.profile_id) ?? 0,
    })),
    chat,
    chatTotal: chatVotes.length,
  };
}
