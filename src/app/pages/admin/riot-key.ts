import { Component, computed, inject, resource, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { GameAccountService } from '../../services/game-account.service';

// Riots Entwicklungsschlüssel gilt 24 Stunden.
const DEV_KEY_LIFETIME_MS = 24 * 60 * 60_000;

/** Riot-API-Schlüssel pflegen. Der Schlüssel selbst wird nie zurückgelesen, nur sein Status. */
@Component({
  selector: 'app-riot-key',
  imports: [DatePipe],
  templateUrl: './riot-key.html',
})
export class RiotKey {
  private readonly gameAccounts = inject(GameAccountService);

  protected readonly error = signal<string | null>(null);
  protected readonly saved = signal(false);

  protected readonly status = resource({ loader: () => this.gameAccounts.getRiotApiKeyStatus() });

  protected readonly expiresAt = computed(() => {
    const updatedAt = this.status.value()?.updated_at;
    return updatedAt ? new Date(Date.parse(updatedAt) + DEV_KEY_LIFETIME_MS) : null;
  });

  protected readonly expired = computed(() => {
    const expiresAt = this.expiresAt();
    return !!expiresAt && expiresAt.getTime() < Date.now();
  });

  protected async save(event: Event, keyEl: HTMLInputElement): Promise<void> {
    event.preventDefault();
    this.error.set(null);
    this.saved.set(false);
    try {
      await this.gameAccounts.setRiotApiKey(keyEl.value);
      keyEl.value = '';
      this.saved.set(true);
      this.status.reload();
    } catch (err) {
      console.error(err);
      this.error.set('Schlüssel konnte nicht gespeichert werden.');
    }
  }
}
