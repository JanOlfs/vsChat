import { Injectable, computed, effect, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { Profile } from '../models/types';

/**
 * sessionStorage-Key für den Rücksprungpfad nach dem Twitch-Login. Bewusst kein
 * Query-Parameter an der redirectTo-URL, weil Supabase die Redirect-URL exakt
 * gegen die Allow-List matcht und ein angehängtes `?next=...` das verhindert.
 */
export const AUTH_RETURN_TO_KEY = 'auth_return_to';

/** Login/Logout über Twitch-OAuth, hält das eigene Profil als Signal. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _currentProfile = signal<Profile | null>(null);
  readonly currentProfile = this._currentProfile.asReadonly();
  readonly isLoggedIn = computed(() => this.supabase.session() != null);

  private resolveReady!: () => void;
  /**
   * Wird aufgelöst, sobald die Session geprüft (und bei vorhandener Session das
   * Profil geladen) ist. Guards warten darauf, damit ein harter Reload auf einer
   * geschützten Route nicht fälschlich als "nicht eingeloggt" gewertet wird,
   * nur weil die Session-Prüfung noch nicht durch ist.
   */
  readonly ready: Promise<void> = new Promise((resolve) => {
    this.resolveReady = resolve;
  });

  constructor(private readonly supabase: SupabaseService) {
    effect(() => {
      const session = this.supabase.session();
      if (session === undefined) {
        return; // noch nicht geprüft
      }
      if (!session) {
        this._currentProfile.set(null);
        this.resolveReady();
        return;
      }
      void this.loadProfile(session.user.id).finally(() => this.resolveReady());
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
    sessionStorage.setItem(AUTH_RETURN_TO_KEY, returnTo);
    const redirectTo = `${window.location.origin}/auth/callback`;
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
