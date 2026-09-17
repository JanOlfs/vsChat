import { Injectable, signal } from '@angular/core';
import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

/** Kapselt den Supabase-Client, stellt die Session als Signal bereit. */
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient = createClient(environment.supabaseUrl, environment.supabaseAnonKey);

  private readonly _session = signal<Session | null>(null);
  readonly session = this._session.asReadonly();

  constructor() {
    this.client.auth.getSession().then(({ data }) => this._session.set(data.session));
    this.client.auth.onAuthStateChange((_event, session) => this._session.set(session));
  }
}
