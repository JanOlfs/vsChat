import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { MatchWinner, MatchWithDetails } from '../models/types';

@Injectable({ providedIn: 'root' })
export class MatchService {
  constructor(private readonly supabase: SupabaseService) {}

  async getMatches(): Promise<MatchWithDetails[]> {
    const { data, error } = await this.supabase.client
      .from('matches')
      .select('*, category:categories(*), profile:profiles(*)')
      .order('created_at', { ascending: false });
    if (error) {
      throw error;
    }
    return (data ?? []) as unknown as MatchWithDetails[];
  }

  /** Nur Admin (RLS): trägt nachträglich ein, wer das Match gewonnen hat. */
  async setMatchWinner(matchId: string, winner: MatchWinner): Promise<void> {
    const { error } = await this.supabase.client.from('matches').update({ winner }).eq('id', matchId);
    if (error) {
      throw error;
    }
  }
}
