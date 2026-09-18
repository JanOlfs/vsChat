import { Component, DestroyRef, inject, resource } from '@angular/core';
import { LiveRoundService } from '../../services/live-round.service';
import { ApplicationService } from '../../services/application.service';
import { SupabaseService } from '../../services/supabase.service';
import type { LiveRound } from '../../models/types';

// Realtime hält uns aktuell, das hier ist nur das Sicherheitsnetz falls eine
// Verbindung mal hängt (z.B. Laptop kurz im Standby).
const FALLBACK_POLL_INTERVAL_MS = 30000;

/**
 * Browser-Source für OBS: kein Kopf-/Fußzeile-Layout (eigene Top-Level-Route
 * ohne Shell, siehe app.routes.ts), transparenter Hintergrund.
 */
@Component({
  selector: 'app-overlay',
  templateUrl: './overlay.html',
})
export class Overlay {
  private readonly liveRoundService = inject(LiveRoundService);
  private readonly applicationService = inject(ApplicationService);
  private readonly supabase = inject(SupabaseService);

  protected readonly round = resource({
    loader: () => this.liveRoundService.getLiveRound(),
  });

  // Während des Check-ins zeigen wir ALLE Bewerber der Kategorie (rot/grün),
  // nicht nur die bereits Eingecheckten, deshalb ein zweiter Resource-Load.
  // Params ist bewusst die nackte category_id (kein neues Objekt bei jedem
  // 2s-Poll), sonst hält resource() jeden Poll für "neue" Parameter und lädt
  // die Liste ständig neu, wodurch sie kurz leer aufblitzt.
  protected readonly applicants = resource({
    params: () => {
      const r = this.round.value();
      return r?.phase === 'checkin' ? (r.category_id ?? undefined) : undefined;
    },
    loader: ({ params }) => this.applicationService.getApplicationsForCategory(params),
  });

  protected isCheckedIn(profileId: string, round: LiveRound): boolean {
    return round.checked_in.some((viewer) => viewer.profile_id === profileId);
  }

  constructor() {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';

    const channel = this.supabase.client
      .channel('overlay')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_round' }, () => this.round.reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'applications' }, () => this.applicants.reload())
      .subscribe();
    const interval = setInterval(() => this.round.reload(), FALLBACK_POLL_INTERVAL_MS);

    inject(DestroyRef).onDestroy(() => {
      document.documentElement.style.background = '';
      document.body.style.background = '';
      clearInterval(interval);
      void this.supabase.client.removeChannel(channel);
    });
  }
}
