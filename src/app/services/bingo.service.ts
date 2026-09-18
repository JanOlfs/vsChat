import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { BingoBoard, BingoCategory, BingoCellWithDetails } from '../models/types';

const GRID_SIZE = 25;

@Injectable({ providedIn: 'root' })
export class BingoService {
  constructor(private readonly supabase: SupabaseService) {}

  /** Boards, die der eingeloggte User verwaltet (Admin) oder als Gegner mitspielt. */
  async getMyBoards(profileId: string, twitchLogin: string): Promise<BingoBoard[]> {
    const { data, error } = await this.supabase.client
      .from('bingo_boards')
      .select('*, created_by_profile:profiles(*)')
      .or(`created_by.eq.${profileId},opponent_twitch_login.ilike.${twitchLogin}`)
      .order('created_at', { ascending: false });
    if (error) {
      throw error;
    }
    return (data ?? []) as unknown as BingoBoard[];
  }

  async getBoard(id: string): Promise<BingoBoard | null> {
    const { data, error } = await this.supabase.client
      .from('bingo_boards')
      .select('*, created_by_profile:profiles(*)')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      throw error;
    }
    return data as unknown as BingoBoard | null;
  }

  /** Legt ein Board samt 25 leeren Zellen an. */
  async createBoard(name: string, opponentTwitchLogin: string, createdBy: string): Promise<{ id: string }> {
    const { data, error } = await this.supabase.client
      .from('bingo_boards')
      .insert({ name, opponent_twitch_login: opponentTwitchLogin, created_by: createdBy })
      .select('id')
      .single();
    if (error) {
      throw error;
    }

    const cells = Array.from({ length: GRID_SIZE }, (_, position) => ({ board_id: data.id, position }));
    const { error: cellsError } = await this.supabase.client.from('bingo_cells').insert(cells);
    if (cellsError) {
      throw cellsError;
    }

    return data;
  }

  async setBoardStatus(id: string, status: 'setup' | 'active' | 'finished'): Promise<void> {
    const { error } = await this.supabase.client.from('bingo_boards').update({ status }).eq('id', id);
    if (error) {
      throw error;
    }
  }

  /** Setzt alle Claims zurück und schickt das Board zurück in den Setup-Modus, Anordnung bleibt erhalten. */
  async resetBoard(id: string): Promise<void> {
    await this.clearClaims(id);
    await this.setBoardStatus(id, 'setup');
  }

  /** Nur die Claims löschen, Status bleibt wie er ist (z.B. für eine Revanche mit demselben Board). */
  async clearClaims(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('bingo_cells')
      .update({ claimed_by: null, claimed_at: null })
      .eq('board_id', id);
    if (error) {
      throw error;
    }
  }

  async deleteBoard(id: string): Promise<void> {
    const { error } = await this.supabase.client.from('bingo_boards').delete().eq('id', id);
    if (error) {
      throw error;
    }
  }

  async getCategories(boardId: string): Promise<BingoCategory[]> {
    const { data, error } = await this.supabase.client
      .from('bingo_categories')
      .select('*')
      .eq('board_id', boardId)
      .order('created_at', { ascending: true });
    if (error) {
      throw error;
    }
    return data ?? [];
  }

  async addCategory(boardId: string, label: string): Promise<void> {
    const { error } = await this.supabase.client.from('bingo_categories').insert({ board_id: boardId, label });
    if (error) {
      throw error;
    }
  }

  async deleteCategory(id: string): Promise<void> {
    const { error } = await this.supabase.client.from('bingo_categories').delete().eq('id', id);
    if (error) {
      throw error;
    }
  }

  async getCells(boardId: string): Promise<BingoCellWithDetails[]> {
    const { data, error } = await this.supabase.client
      .from('bingo_cells')
      .select('*, category:bingo_categories(*), claimed_by_profile:profiles(*)')
      .eq('board_id', boardId)
      .order('position', { ascending: true });
    if (error) {
      throw error;
    }
    return (data ?? []) as unknown as BingoCellWithDetails[];
  }

  /** Weist einer Zelle eine Pool-Kategorie zu (oder entfernt sie mit null). Nur Admin (RLS). */
  async assignCategoryToCell(cellId: string, categoryId: string | null): Promise<void> {
    const { error } = await this.supabase.client
      .from('bingo_cells')
      .update({ category_id: categoryId })
      .eq('id', cellId);
    if (error) {
      throw error;
    }
  }

  /** Nimmt alle Kategorien vom Grid, sie landen wieder im Pool. Löscht keine Kategorien. */
  async clearGrid(boardId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('bingo_cells')
      .update({ category_id: null })
      .eq('board_id', boardId);
    if (error) {
      throw error;
    }
  }

  /** Claimt eine Zelle für den eingeloggten User. Lockout wird per RLS erzwungen (claimed_by is null). */
  async claimCell(cellId: string, profileId: string): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('bingo_cells')
      .update({ claimed_by: profileId, claimed_at: new Date().toISOString() })
      .eq('id', cellId)
      .select('id')
      .maybeSingle();
    if (error) {
      throw error;
    }
    if (!data) {
      throw new Error('Feld ist schon vergeben.');
    }
  }
}
