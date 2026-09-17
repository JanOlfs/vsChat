import { Component, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AUTH_RETURN_TO_KEY, AuthService } from '../../services/auth.service';

/** OAuth-Rücksprung von Twitch. Supabase parst die URL selbst, wir warten nur auf die Session. */
@Component({
  selector: 'app-auth-callback',
  template: `
    @if (error(); as message) {
      <p role="alert">Login fehlgeschlagen: {{ message }}</p>
    } @else {
      <p>Anmeldung wird verarbeitet …</p>
    }
  `,
})
export class AuthCallback {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  protected readonly error = signal<string | null>(null);

  constructor() {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get('error_description') ?? params.get('error');
    if (oauthError) {
      this.error.set(oauthError);
      return;
    }

    const next = sessionStorage.getItem(AUTH_RETURN_TO_KEY) ?? '/';
    sessionStorage.removeItem(AUTH_RETURN_TO_KEY);
    effect(() => {
      if (this.auth.isLoggedIn()) {
        void this.router.navigateByUrl(next);
      }
    });
  }
}
