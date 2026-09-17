import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { ApplicationWithCategory, ApplicationWithProfile } from '../models/types';

@Injectable({ providedIn: 'root' })
export class ApplicationService {
  constructor(private readonly supabase: SupabaseService) {}

  async getApplicationsForCategory(categoryId: string): Promise<ApplicationWithProfile[]> {
    const { data, error } = await this.supabase.client
      .from('applications')
      .select('*, profile:profiles(*)')
      .eq('category_id', categoryId)
      .order('created_at', { ascending: true });
    if (error) {
      throw error;
    }
    return (data ?? []) as unknown as ApplicationWithProfile[];
  }

  async getMyApplications(profileId: string): Promise<ApplicationWithCategory[]> {
    const { data, error } = await this.supabase.client
      .from('applications')
      .select('*, category:categories(*)')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: true });
    if (error) {
      throw error;
    }
    return (data ?? []) as unknown as ApplicationWithCategory[];
  }

  async apply(profileId: string, categoryId: string, note?: string): Promise<ApplicationWithProfile> {
    const { data, error } = await this.supabase.client
      .from('applications')
      .insert({ profile_id: profileId, category_id: categoryId, note: note ?? null })
      .select('*, profile:profiles(*)')
      .single();
    if (error) {
      throw error;
    }
    return data as unknown as ApplicationWithProfile;
  }

  /** Auch für Admins nutzbar, um eine fremde Bewerbung zu entfernen (siehe adminGuard/RLS). */
  async withdraw(applicationId: string): Promise<void> {
    const { error } = await this.supabase.client.from('applications').delete().eq('id', applicationId);
    if (error) {
      throw error;
    }
  }

  /** Admin-Reset: löscht alle Bewerbungen einer Kategorie, für eine neue Runde. */
  async deleteAllForCategory(categoryId: string): Promise<void> {
    const { error } = await this.supabase.client.from('applications').delete().eq('category_id', categoryId);
    if (error) {
      throw error;
    }
  }
}
