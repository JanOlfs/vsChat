import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { environment } from '../../environments/environment';

type RoundAction = 'opencheckin' | 'closecheckin' | 'startvote' | 'closevote';

/**
 * Ruft die Admin-Endpunkte des Chatbot-Workers auf (Alternative zu den
 * Chat-Befehlen !opencheckin usw., löst intern dieselben Aktionen aus).
 * Auth läuft über den eigenen Supabase-Access-Token, der Worker prüft
 * profiles.is_admin selbst nochmal nach.
 */
@Injectable({ providedIn: 'root' })
export class RoundControlService {
  private readonly supabase = inject(SupabaseService);

  async openCheckin(slug: string): Promise<void> {
    await this.call('opencheckin', { slug });
  }

  async closeCheckin(): Promise<void> {
    await this.call('closecheckin');
  }

  async startVote(): Promise<void> {
    await this.call('startvote');
  }

  async closeVote(): Promise<void> {
    await this.call('closevote');
  }

  private async call(action: RoundAction, body?: unknown): Promise<void> {
    const { data } = await this.supabase.client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      throw new Error('Nicht eingeloggt.');
    }

    const response = await fetch(`${environment.chatbotUrl}/${action}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      throw new Error(`Aktion fehlgeschlagen (${response.status})`);
    }
  }
}
