import type { SupabaseClient } from '@supabase/supabase-js';

// Alle Spieler sind auf EUW. Spectator läuft über den Plattform-Host,
// Account- und Match-Daten über den regionalen Host.
const PLATFORM_HOST = 'https://euw1.api.riotgames.com';
const REGIONAL_HOST = 'https://europe.api.riotgames.com';
const DDRAGON = 'https://ddragon.leagueoflegends.com';
const CHAMPION_CACHE_MS = 6 * 60 * 60_000;
const MIN_ROUND_PLAYERS_IN_GAME = 1;

/** Wird im Frontend 1:1 als RiotParticipant gelesen (src/app/models/types.ts). */
interface StoredParticipant {
  puuid: string;
  riot_id: string;
  team_id: number;
  champion_name: string;
  champion_image: string | null;
  champion_id?: number; // für den Stats-Abgleich, wenn Riot keine PUUID liefert
  profile_id: string | null;
  twitch_name: string | null;
  // Erst nach Spielende aus Match-V5 ergänzt.
  kills?: number;
  deaths?: number;
  assists?: number;
  win?: boolean;
}

class RiotKeyError extends Error {}

let championCache: { loadedAt: number; byKey: Map<string, { name: string; image: string }> } | null = null;

/**
 * Ein Durchlauf: offene Riot IDs auflösen, für laufende LoL-Imposter-Runden
 * das Live-Spiel suchen bzw. nach Spielende das Ergebnis eintragen.
 * Gibt true zurück, solange eine Runde läuft, dann pollt der Aufrufer schneller.
 */
export async function pollImposterLol(supabase: SupabaseClient): Promise<boolean> {
  const { data: keyRow } = await supabase.from('riot_api_key').select('api_key').maybeSingle();
  const { data: games } = await supabase
    .from('imposter_games')
    .select('id, current_round, status')
    // voting auch, falls der Admin das Ergebnis schneller eingetragen hat als Riot die Stats liefert.
    .in('status', ['playing', 'voting'])
    .eq('game_key', 'lol');
  const playing = (games ?? []).length > 0;
  if (!keyRow) return playing;

  try {
    // Billiger Aufruf bei jedem Durchlauf, damit das Admin-Panel vor dem Start
    // einer Runde verlässlich weiß, ob der Schlüssel noch gilt.
    await riotGet(`${PLATFORM_HOST}/lol/status/v4/platform-data`, keyRow.api_key);
    await supabase
      .from('riot_api_key')
      .update({ last_ok_at: new Date().toISOString(), last_error: null, last_error_at: null })
      .eq('id', 1);
    await resolvePendingAccounts(supabase, keyRow.api_key);
    for (const game of games ?? []) {
      await pollGame(supabase, keyRow.api_key, game.id, game.current_round, game.status);
    }
  } catch (err) {
    if (!(err instanceof RiotKeyError)) throw err;
    // Abgelaufener/ungültiger Schlüssel: im Admin-Panel anzeigen statt nur zu loggen.
    await supabase
      .from('riot_api_key')
      .update({ last_error: err.message, last_error_at: new Date().toISOString() })
      .eq('id', 1);
  }
  return playing;
}

async function riotGet<T>(url: string, apiKey: string): Promise<T | null> {
  const response = await fetch(url, { headers: { 'X-Riot-Token': apiKey } });
  if (response.status === 404) return null;
  if (response.status === 401 || response.status === 403) {
    throw new RiotKeyError(`Riot hat den Schlüssel abgelehnt (${response.status}), vermutlich abgelaufen.`);
  }
  if (!response.ok) {
    throw new Error(`Riot API ${response.status} für ${url}`);
  }
  return (await response.json()) as T;
}

async function resolvePendingAccounts(supabase: SupabaseClient, apiKey: string): Promise<void> {
  const { data: pending } = await supabase
    .from('game_accounts')
    .select('id, name')
    .eq('game_key', 'lol')
    .eq('status', 'pending');

  for (const account of pending ?? []) {
    const hash = account.name.lastIndexOf('#');
    const gameName = account.name.slice(0, hash).trim();
    const tagLine = account.name.slice(hash + 1).trim();
    const found =
      hash > 0 && tagLine
        ? await riotGet<{ puuid: string }>(
            `${REGIONAL_HOST}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
            apiKey,
          )
        : null;
    await supabase
      .from('game_accounts')
      .update(found ? { status: 'ok', external_id: found.puuid } : { status: 'not_found' })
      .eq('id', account.id);
  }
}

async function pollGame(
  supabase: SupabaseClient,
  apiKey: string,
  gameId: string,
  round: number,
  status: string,
): Promise<void> {
  const { data: roundRow } = await supabase
    .from('imposter_rounds')
    .select('riot_match_id, riot_participants')
    .eq('game_id', gameId)
    .eq('round', round)
    .maybeSingle();
  if (!roundRow) return;
  // In der Abstimmung nur noch fehlende Stats nachholen, kein neues Spiel mehr suchen.
  const hasStats = ((roundRow.riot_participants ?? []) as StoredParticipant[]).some((p) => p.kills !== undefined);
  if (status === 'voting' && (!roundRow.riot_match_id || hasStats)) return;

  const { data: roles } = await supabase
    .from('imposter_roles')
    .select('profile_id')
    .eq('game_id', gameId)
    .eq('round', round);
  const roundPlayers = new Set((roles ?? []).map((r) => r.profile_id as string));

  if (!roundRow.riot_match_id) {
    await findLiveGame(supabase, apiKey, gameId, round, roundPlayers);
  } else {
    await fetchResult(supabase, apiKey, gameId, round, roundRow.riot_match_id, roundRow.riot_participants ?? [], roundPlayers);
  }
}

interface SpectatorGame {
  gameId: number;
  platformId: string;
  participants: { puuid: string | null; riotId?: string; teamId: number; championId: number }[];
}

async function findLiveGame(
  supabase: SupabaseClient,
  apiKey: string,
  gameId: string,
  round: number,
  roundPlayers: Set<string>,
): Promise<void> {
  // Auch ein Spiel, das schon vor dem Verteilen der Rollen lief, wird übernommen.
  // Nur eins, das schon einer früheren Runde gehört, nicht (sonst hängt die neue
  // Runde am alten Spiel, solange das noch läuft).
  const { data: earlier } = await supabase
    .from('imposter_rounds')
    .select('riot_match_id')
    .eq('game_id', gameId)
    .lt('round', round)
    .not('riot_match_id', 'is', null);
  const usedMatchIds = new Set((earlier ?? []).map((r) => r.riot_match_id as string));

  const { data: accounts } = await supabase
    .from('game_accounts')
    .select('profile_id, external_id, profile:profiles(display_name)')
    .eq('game_key', 'lol')
    .eq('status', 'ok');
  const profileByPuuid = new Map((accounts ?? []).map((a) => [a.external_id as string, a.profile_id as string]));
  const nameByPuuid = new Map(
    (accounts ?? []).map((a) => [a.external_id as string, (a.profile as unknown as { display_name: string } | null)?.display_name ?? null]),
  );
  const candidates = (accounts ?? []).filter((a) => roundPlayers.has(a.profile_id));
  // ponytail: zum Testen reicht 1 Spieler der Runde im Spiel. Später auf 2 stellen,
  // damit nicht das Solo-Spiel eines einzelnen Spielers als Rundenspiel erkannt wird.
  const required = Math.min(MIN_ROUND_PLAYERS_IN_GAME, new Set(candidates.map((a) => a.profile_id)).size);

  // Erster Treffer reicht, die Mitspieler stehen dann ohnehin in der Antwort.
  for (const account of candidates) {
    const live = await riotGet<SpectatorGame>(
      `${PLATFORM_HOST}/lol/spectator/v5/active-games/by-summoner/${account.external_id}`,
      apiKey,
    );
    if (!live) continue;
    if (usedMatchIds.has(`${live.platformId}_${live.gameId}`)) continue;

    // Nur übernehmen, wenn wirklich die Runde spielt und nicht einer allein nebenher.
    const inGame = new Set(live.participants.map((p) => (p.puuid && profileByPuuid.get(p.puuid)) || null));
    const roundPlayersInGame = [...roundPlayers].filter((id) => inGame.has(id)).length;
    if (roundPlayersInGame < required) continue;

    const champions = await loadChampions();
    const participants: StoredParticipant[] = live.participants.map((p) => {
      const champion = champions.get(String(p.championId));
      return {
        puuid: p.puuid ?? '',
        riot_id: p.riotId ?? '',
        team_id: p.teamId,
        champion_name: champion?.name ?? 'Unbekannt',
        champion_id: p.championId,
        champion_image: champion?.image ?? null,
        profile_id: (p.puuid && profileByPuuid.get(p.puuid)) || null,
        twitch_name: (p.puuid && nameByPuuid.get(p.puuid)) || null,
      };
    });
    await supabase
      .from('imposter_rounds')
      .update({ riot_match_id: `${live.platformId}_${live.gameId}`, riot_participants: participants })
      .eq('game_id', gameId)
      .eq('round', round);
    return;
  }
}

interface MatchDto {
  info: {
    teams: { teamId: number; win: boolean }[];
    participants: {
      puuid: string;
      teamId: number;
      championId: number;
      kills: number;
      deaths: number;
      assists: number;
      win: boolean;
    }[];
  };
}

async function fetchResult(
  supabase: SupabaseClient,
  apiKey: string,
  gameId: string,
  round: number,
  matchId: string,
  participants: StoredParticipant[],
  roundPlayers: Set<string>,
): Promise<void> {
  // 404 solange das Spiel läuft, Riot stellt das Match erst kurz nach Spielende bereit.
  const match = await riotGet<MatchDto>(`${REGIONAL_HOST}/lol/match/v5/matches/${matchId}`, apiKey);
  if (!match) return;

  // Unser Team = das Team, in dem die meisten Spieler der Runde sind.
  const teamCounts = new Map<number, number>();
  for (const p of participants) {
    if (p.profile_id && roundPlayers.has(p.profile_id)) teamCounts.set(p.team_id, (teamCounts.get(p.team_id) ?? 0) + 1);
  }
  const ourTeam = [...teamCounts].sort((a, b) => b[1] - a[1])[0]?.[0];
  const won = match.info.teams.find((t) => t.teamId === ourTeam)?.win;
  if (won === undefined) return;

  // Frisch lesen, damit eine gerade gemachte Hand-Zuordnung des Admins nicht überschrieben wird.
  const { data: fresh } = await supabase
    .from('imposter_rounds')
    .select('riot_participants')
    .eq('game_id', gameId)
    .eq('round', round)
    .maybeSingle();
  const statsByPuuid = new Map(match.info.participants.map((p) => [p.puuid, p]));
  // Ersatz, falls die Spectator-API für einen Spieler keine PUUID geliefert hat: Team + Champion ist pro Spiel eindeutig.
  const statsByTeamChampion = new Map(match.info.participants.map((p) => [`${p.teamId}:${p.championId}`, p]));
  const withStats = ((fresh?.riot_participants ?? participants) as StoredParticipant[]).map((p) => {
    const stats = statsByPuuid.get(p.puuid) ?? statsByTeamChampion.get(`${p.team_id}:${p.champion_id}`);
    return stats ? { ...p, kills: stats.kills, deaths: stats.deaths, assists: stats.assists, win: stats.win } : p;
  });

  await supabase
    .from('imposter_rounds')
    .update({ result: won ? 'win' : 'loss', riot_participants: withStats })
    .eq('game_id', gameId)
    .eq('round', round);
  // Nur wenn der Admin nicht schon selbst weitergeschaltet hat.
  await supabase.from('imposter_games').update({ status: 'voting' }).eq('id', gameId).eq('status', 'playing');
}

/** Champion-ID (z.B. "266") -> Name und Bild-URL aus Data Dragon, ein paar Stunden gecacht. */
async function loadChampions(): Promise<Map<string, { name: string; image: string }>> {
  if (championCache && Date.now() - championCache.loadedAt < CHAMPION_CACHE_MS) {
    return championCache.byKey;
  }
  const versions = (await (await fetch(`${DDRAGON}/api/versions.json`)).json()) as string[];
  const version = versions[0];
  const data = (await (await fetch(`${DDRAGON}/cdn/${version}/data/de_DE/champion.json`)).json()) as {
    data: Record<string, { key: string; id: string; name: string }>;
  };
  const byKey = new Map(
    Object.values(data.data).map((c) => [c.key, { name: c.name, image: `${DDRAGON}/cdn/${version}/img/champion/${c.id}.png` }]),
  );
  championCache = { loadedAt: Date.now(), byKey };
  return byKey;
}
