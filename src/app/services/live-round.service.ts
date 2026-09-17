import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { LiveRound } from '../models/types';

@Injectable({ providedIn: 'root' })
export class LiveRoundService {
  constructor(private readonly supabase: SupabaseService) {}

  async getLiveRound(): Promise<LiveRound> {
    const { data, error } = await this.supabase.client
      .from('live_round')
      .select('*, category:categories(*)')
      .eq('id', 1)
      .single();
    if (error) {
      throw error;
    }
    return data as unknown as LiveRound;
  }
}
