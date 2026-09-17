import { Injectable, computed, effect, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { Profile } from '../models/types';

/** Login/Logout über Twitch-OAuth, hält das eigene Profil als Signal. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _currentProfile = signal<Profile | null>(null);
  readonly currentProfile = this._currentProfile.asReadonly();
  readonly isLoggedIn = computed(() => this.supabase.session() !== null);

  constructor(private readonly supabase: SupabaseService) {
    effect(() => {
      const session = this.supabase.session();
      if (!session) {
        this._currentProfile.set(null);
        return;
      }
      void this.loadProfile(session.user.id);
    });
  }

  private async loadProfile(userId: string): Promise<void> {
    const { data, error } = await this.supabase.client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) {
      console.error('Profil konnte nicht geladen werden', error);
      this._currentProfile.set(null);
      return;
    }
    this._currentProfile.set(data);
  }

  /** Schickt den User zum Twitch-Login, danach zurück auf `returnTo`. */
  async loginWithTwitch(returnTo: string): Promise<void> {
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(returnTo)}`;
    const { error } = await this.supabase.client.auth.signInWithOAuth({
      provider: 'twitch',
      options: { redirectTo },
    });
    if (error) {
      throw error;
    }
  }

  async logout(): Promise<void> {
    const { error } = await this.supabase.client.auth.signOut();
    if (error) {
      throw error;
    }
  }
}
