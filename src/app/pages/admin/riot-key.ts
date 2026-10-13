import { Component, DestroyRef, inject, resource, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { GameAccountService } from '../../services/game-account.service';

// Der Worker prüft den Schlüssel bei jedem Durchlauf, hier nur gelegentlich nachladen.
const STATUS_RELOAD_MS = 30_000;

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

  constructor() {
    // Nach dem Speichern soll "wird geprüft" ohne Neuladen zu "funktioniert" werden.
    const interval = setInterval(() => this.status.reload(), STATUS_RELOAD_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(interval));
  }

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
