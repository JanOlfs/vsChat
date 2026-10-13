import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { ImposterGame, ImposterGameStatus, ImposterResult, ImposterState, RiotParticipant } from '../models/types';

@Injectable({ providedIn: 'root' })
export class ImposterService {
  constructor(private readonly supabase: SupabaseService) {}

  async getGames(): Promise<ImposterGame[]> {
    const { data, error } = await this.supabase.client
      .from('imposter_games')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      throw error;
    }
    return data ?? [];
  }

  /**
   * Alles zu einem Spiel in einem Rutsch, damit Spiel- und Overlay-Seite bei
   * jeder Realtime-Änderung einfach komplett neu laden können. Rollen und
   * Chat-Tipps filtert RLS (eigene bzw. nur aufgelöste Runden).
   */
  async getState(gameId: string): Promise<ImposterState | null> {
    const db = this.supabase.client;
    const [game, players, rounds, roles, chatVotes] = await Promise.all([
      db.from('imposter_games').select('*').eq('id', gameId).maybeSingle(),
      db.from('imposter_players').select('*, profile:profiles(*)').eq('game_id', gameId).order('joined_at'),
      db.from('imposter_rounds').select('*').eq('game_id', gameId).order('round'),
      db.from('imposter_roles').select('*').eq('game_id', gameId),
      db.from('imposter_chat_votes').select('*').eq('game_id', gameId),
    ]);
    const error = game.error ?? players.error ?? rounds.error ?? roles.error ?? chatVotes.error;
    if (error) {
      throw error;
    }
    if (!game.data) {
      return null;
    }
    return {
      game: game.data,
      players: (players.data ?? []) as unknown as ImposterState['players'],
      rounds: rounds.data ?? [],
      roles: roles.data ?? [],
      chatVotes: chatVotes.data ?? [],
    };
  }

  /** Ein Realtime-Channel für alle Imposter-Tabellen eines Spiels, gibt die Aufräumfunktion zurück. */
  watch(gameId: string, onChange: () => void): () => void {
    let channel = this.supabase.client
      .channel(`imposter-${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'imposter_games', filter: `id=eq.${gameId}` }, onChange);
    for (const table of ['imposter_players', 'imposter_rounds', 'imposter_roles', 'imposter_chat_votes']) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `game_id=eq.${gameId}` }, onChange);
    }
    channel.subscribe();
    return () => void this.supabase.client.removeChannel(channel);
  }

  async createGame(game: Pick<ImposterGame, 'name' | 'game_key' | 'max_players' | 'paranoia_percent' | 'created_by'>): Promise<{ id: string }> {
    const { data, error } = await this.supabase.client.from('imposter_games').insert(game).select('id').single();
    if (error) {
      throw error;
    }
    return data;
  }

  async deleteGame(id: string): Promise<void> {
    const { error } = await this.supabase.client.from('imposter_games').delete().eq('id', id);
    if (error) {
      throw error;
    }
  }

  async join(gameId: string, profileId: string): Promise<void> {
    const { error } = await this.supabase.client.from('imposter_players').insert({ game_id: gameId, profile_id: profileId });
    if (error) {
      throw error;
    }
  }

  /** Verlassen (eigener Eintrag) oder Rauswerfen (Admin), RLS entscheidet. */
  async removePlayer(gameId: string, profileId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('imposter_players')
      .delete()
      .eq('game_id', gameId)
      .eq('profile_id', profileId);
    if (error) {
      throw error;
    }
  }

  async assignRoles(gameId: string): Promise<void> {
    const { error } = await this.supabase.client.rpc('imposter_assign_roles', { p_game_id: gameId });
    if (error) {
      throw error;
    }
  }

  async setStatus(gameId: string, status: ImposterGameStatus): Promise<void> {
    const { error } = await this.supabase.client.from('imposter_games').update({ status }).eq('id', gameId);
    if (error) {
      throw error;
    }
  }

  async setResult(gameId: string, round: number, result: ImposterResult): Promise<void> {
    const { error } = await this.supabase.client
      .from('imposter_rounds')
      .update({ result })
      .eq('game_id', gameId)
      .eq('round', round);
    if (error) {
      throw error;
    }
  }

  /** Admin: speichert die (per Hand korrigierte) Zuordnung Ingame-Spieler zu Profil. */
  async setParticipants(gameId: string, round: number, participants: RiotParticipant[]): Promise<void> {
    const { error } = await this.supabase.client
      .from('imposter_rounds')
      .update({ riot_participants: participants })
      .eq('game_id', gameId)
      .eq('round', round);
    if (error) {
      throw error;
    }
  }

  /** target null = "kein Imposter" (nur mit Paranoia). */
  async vote(gameId: string, target: string | null): Promise<void> {
    const { error } = await this.supabase.client.rpc('imposter_vote', { p_game_id: gameId, p_target: target });
    if (error) {
      throw error;
    }
  }
}
