import { Injectable, signal } from '@angular/core';
import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

/** Kapselt den Supabase-Client, stellt die Session als Signal bereit. */
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient = createClient(environment.supabaseUrl, environment.supabaseAnonKey);

  // undefined = noch nicht geprüft (z.B. direkt nach einem Reload), null = geprüft, keine Session.
  // Die Unterscheidung ist wichtig, sonst hält ein Guard "noch nicht geprüft" für "nicht eingeloggt"
  // und wirft eingeloggte User bei einem harten Reload auf einer geschützten Route raus.
  private readonly _session = signal<Session | null | undefined>(undefined);
  readonly session = this._session.asReadonly();

  constructor() {
    this.client.auth.getSession().then(({ data }) => this._session.set(data.session));
    this.client.auth.onAuthStateChange((_event, session) => this._session.set(session));
  }
}
