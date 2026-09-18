import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { APP_VERSION } from '../version';
import { ConfirmDialog } from '../shared/confirm-dialog/confirm-dialog';

/**
 * Kopf- und Fußzeile für die normalen Seiten. `/overlay` (später) bekommt
 * bewusst kein Shell-Layout, siehe app.routes.ts.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterOutlet, ConfirmDialog],
  templateUrl: './shell.html',
})
export class Shell {
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  protected readonly version = APP_VERSION;

  protected async login(): Promise<void> {
    await this.auth.loginWithTwitch(this.router.url);
  }

  protected async logout(): Promise<void> {
    await this.auth.logout();
  }
}
