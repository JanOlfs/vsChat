import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { environment } from '../../environments/environment';
import type { GameAccount } from '../models/types';

/** Spielkonten (bei LoL Riot IDs) und die Riot-Anbindung über den Chatbot-Worker. */
@Injectable({ providedIn: 'root' })
export class GameAccountService {
  private readonly supabase = inject(SupabaseService);

  async getMine(profileId: string): Promise<GameAccount[]> {
    const { data, error } = await this.supabase.client
      .from('game_accounts')
      .select('*')
      .eq('profile_id', profileId)
      .order('created_at');
    if (error) {
      throw error;
    }
    return data ?? [];
  }

  async add(profileId: string, gameKey: string, name: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('game_accounts')
      .insert({ profile_id: profileId, game_key: gameKey, name });
    if (error) {
      throw error;
    }
    this.pokeWorker();
  }

  /**
   * Admin: speichert eine per Hand zugeordnete Riot ID als schon geprüftes
   * Konto des Spielers. Ist die ID schon eingetragen, passiert nichts.
   */
  async addVerified(profileId: string, gameKey: string, name: string, externalId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('game_accounts')
      .insert({ profile_id: profileId, game_key: gameKey, name, external_id: externalId, status: 'ok' });
    if (error && error.code !== '23505') {
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.supabase.client.from('game_accounts').delete().eq('id', id);
    if (error) {
      throw error;
    }
  }

  /**
   * Sagt dem Worker, dass er jetzt statt beim nächsten Alarm bei Riot
   * nachsehen soll (Konto prüfen, Spielstart suchen). Fire-and-forget, ohne
   * Anstoß passiert dasselbe spätestens nach ein paar Minuten.
   */
  pokeWorker(): void {
    void fetch(`${environment.chatbotUrl}/poke`, { method: 'POST' }).catch(() => undefined);
  }

  async setRiotApiKey(key: string): Promise<void> {
    const { error } = await this.supabase.client.rpc('set_riot_api_key', { p_key: key });
    if (error) {
      throw error;
    }
    this.pokeWorker();
  }

  async getRiotApiKeyStatus(): Promise<{ updated_at: string; last_error: string | null; last_error_at: string | null } | null> {
    const { data, error } = await this.supabase.client.rpc('riot_api_key_status');
    if (error) {
      throw error;
    }
    return data?.[0] ?? null;
  }
}
