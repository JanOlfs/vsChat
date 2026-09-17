import { Component, DestroyRef, inject, resource } from '@angular/core';
import { LiveRoundService } from '../../services/live-round.service';
import { ApplicationService } from '../../services/application.service';
import type { LiveRound } from '../../models/types';

const POLL_INTERVAL_MS = 2000;

/**
 * Browser-Source für OBS: kein Kopf-/Fußzeile-Layout (eigene Top-Level-Route
 * ohne Shell, siehe app.routes.ts), transparenter Hintergrund.
 *
 * ponytail: Polling statt Supabase-Realtime-Subscription, weniger Code für
 * einen einzelnen Browser-Source-Viewer. Nachteil: bis zu 2s Verzögerung,
 * bei Bedarf auf Realtime umstellen.
 */
@Component({
  selector: 'app-overlay',
  templateUrl: './overlay.html',
})
export class Overlay {
  private readonly liveRoundService = inject(LiveRoundService);
  private readonly applicationService = inject(ApplicationService);

  protected readonly round = resource({
    loader: () => this.liveRoundService.getLiveRound(),
  });

  // Während des Check-ins zeigen wir ALLE Bewerber der Kategorie (rot/grün),
  // nicht nur die bereits Eingecheckten, deshalb ein zweiter Resource-Load.
  protected readonly applicants = resource({
    params: () => {
      const r = this.round.value();
      return r?.phase === 'checkin' && r.category_id ? { categoryId: r.category_id } : undefined;
    },
    loader: ({ params }) => this.applicationService.getApplicationsForCategory(params.categoryId),
  });

  protected isCheckedIn(profileId: string, round: LiveRound): boolean {
    return round.checked_in.some((viewer) => viewer.profile_id === profileId);
  }

  constructor() {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';

    const interval = setInterval(() => this.round.reload(), POLL_INTERVAL_MS);

    inject(DestroyRef).onDestroy(() => {
      document.documentElement.style.background = '';
      document.body.style.background = '';
      clearInterval(interval);
    });
  }
}
