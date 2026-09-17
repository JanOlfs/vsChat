import { Component, DestroyRef, inject, resource } from '@angular/core';
import { LiveRoundService } from '../../services/live-round.service';

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

  protected readonly round = resource({
    loader: () => this.liveRoundService.getLiveRound(),
  });

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
