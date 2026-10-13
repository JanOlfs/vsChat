import { Component, effect, inject, resource, signal } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { GameAccountService } from '../../services/game-account.service';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.html',
})
export class Profile {
  private readonly gameAccounts = inject(GameAccountService);
  private readonly supabase = inject(SupabaseService);
  protected readonly auth = inject(AuthService);

  protected readonly error = signal<string | null>(null);

  protected readonly accounts = resource({
    params: () => this.auth.currentProfile()?.id,
    loader: ({ params }) => this.gameAccounts.getMine(params),
  });

  constructor() {
    // Der Worker prüft neue Konten im Hintergrund, das Ergebnis kommt per Realtime rein.
    effect((onCleanup) => {
      const profileId = this.auth.currentProfile()?.id;
      if (!profileId) return;
      const channel = this.supabase.client
        .channel(`game-accounts-${profileId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'game_accounts', filter: `profile_id=eq.${profileId}` },
          () => this.accounts.reload(),
        )
        .subscribe();
      onCleanup(() => void this.supabase.client.removeChannel(channel));
    });
  }

  protected async addAccount(event: Event, nameEl: HTMLInputElement): Promise<void> {
    event.preventDefault();
    this.error.set(null);
    const name = nameEl.value.trim();
    const profileId = this.auth.currentProfile()?.id;
    if (!profileId) return;
    if (!/^.+#.+$/.test(name)) {
      this.error.set('Bitte die komplette Riot ID mit Tag angeben, z.B. Captnblacky#EUW.');
      return;
    }
    try {
      await this.gameAccounts.add(profileId, 'lol', name);
      nameEl.value = '';
      this.accounts.reload();
    } catch (err) {
      console.error(err);
      // 23505 = unique violation, die Riot ID hat schon jemand eingetragen.
      this.error.set(
        (err as { code?: string }).code === '23505'
          ? 'Diese Riot ID ist schon eingetragen.'
          : 'Konto konnte nicht gespeichert werden.',
      );
    }
  }

  protected async removeAccount(id: string): Promise<void> {
    this.error.set(null);
    try {
      await this.gameAccounts.remove(id);
      this.accounts.reload();
    } catch (err) {
      console.error(err);
      this.error.set('Konto konnte nicht entfernt werden.');
    }
  }
}
