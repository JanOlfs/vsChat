import { Component, DestroyRef, inject, resource, signal } from '@angular/core';
import { CategoryService } from '../../services/category.service';
import { ApplicationService } from '../../services/application.service';
import { RoundControlService } from '../../services/round-control.service';
import { LiveRoundService } from '../../services/live-round.service';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';
import { MatchService } from '../../services/match.service';
import { SupabaseService } from '../../services/supabase.service';
import type { CategoryWithCount, MatchWinner } from '../../models/types';

// Realtime hält uns aktuell, das hier ist nur das Sicherheitsnetz falls eine
// Verbindung mal hängt (z.B. Laptop kurz im Standby).
const FALLBACK_POLL_INTERVAL_MS = 30000;

@Component({
  selector: 'app-admin',
  templateUrl: './admin.html',
})
export class Admin {
  private readonly categoryService = inject(CategoryService);
  private readonly applicationService = inject(ApplicationService);
  private readonly roundControl = inject(RoundControlService);
  private readonly liveRoundService = inject(LiveRoundService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly matchService = inject(MatchService);
  private readonly supabase = inject(SupabaseService);

  // Läuft gerade eine Runden-Steuerungs-Aktion (Check-in/Voting), Buttons währenddessen sperren.
  protected readonly roundBusy = signal(false);

  // Aktueller Stand der Check-in/Voting-Runde, damit die Buttons nur passend zur Phase erscheinen.
  protected readonly liveRound = resource({
    loader: () => this.liveRoundService.getLiveRound(),
  });

  protected readonly categories = resource({
    loader: () => this.categoryService.getCategories(),
  });

  protected readonly error = signal<string | null>(null);

  // Für die Bewerber-Verwaltung: welche Kategorie ist gerade aufgeklappt.
  protected readonly selectedCategoryId = signal<string | null>(null);

  protected readonly applicants = resource({
    params: () => this.selectedCategoryId() ?? undefined,
    loader: ({ params }) => this.applicationService.getApplicationsForCategory(params),
  });

  protected readonly matches = resource({
    loader: () => this.matchService.getMatches(),
  });

  constructor() {
    const channel = this.supabase.client
      .channel('admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => this.categories.reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'applications' }, () => {
        this.categories.reload();
        this.applicants.reload();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_round' }, () => this.liveRound.reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => this.matches.reload())
      .subscribe();
    const interval = setInterval(() => this.liveRound.reload(), FALLBACK_POLL_INTERVAL_MS);

    inject(DestroyRef).onDestroy(() => {
      clearInterval(interval);
      void this.supabase.client.removeChannel(channel);
    });
  }

  protected async toggleOpen(category: CategoryWithCount): Promise<void> {
    this.error.set(null);
    try {
      await this.categoryService.setCategoryOpen(category.id, !category.is_open);
      this.categories.reload();
    } catch {
      this.error.set('Status konnte nicht geändert werden.');
    }
  }

  /** Übernimmt ein aus der Zwischenablage eingefügtes Bild ins Datei-Feld, als hätte man's ausgewählt. */
  protected onPasteImage(event: ClipboardEvent, targetInput: HTMLInputElement): void {
    const items = event.clipboardData?.items;
    if (!items) {
      return;
    }
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          event.preventDefault();
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);
          targetInput.files = dataTransfer.files;
        }
        return;
      }
    }
  }

  protected manageApplicants(categoryId: string): void {
    this.selectedCategoryId.set(this.selectedCategoryId() === categoryId ? null : categoryId);
  }

  protected async removeApplicant(applicationId: string): Promise<void> {
    this.error.set(null);
    try {
      await this.applicationService.withdraw(applicationId);
      this.applicants.reload();
      this.categories.reload();
    } catch {
      this.error.set('Bewerbung konnte nicht entfernt werden.');
    }
  }

  /** Kein Effekt, der Aufruf sorgt nur dafür, dass Angular nach der nativen Dateiauswahl neu rendert. */
  protected onBannerFileChange(): void {}

  // Bearbeiten-Modal: Name, Slug, Beschreibung und Banner zusammen in einem
  // Rutsch anpassen, statt Banner separat inline in der Tabelle.
  protected readonly editingCategory = signal<CategoryWithCount | null>(null);

  protected openEditCategory(category: CategoryWithCount): void {
    this.editingCategory.set(category);
  }

  protected closeEditCategory(): void {
    this.editingCategory.set(null);
  }

  protected async saveEditCategory(
    event: Event,
    category: CategoryWithCount,
    slugEl: HTMLInputElement,
    nameEl: HTMLInputElement,
    descriptionEl: HTMLInputElement,
    bannerEl: HTMLInputElement,
  ): Promise<void> {
    event.preventDefault();
    const slug = slugEl.value.trim();
    const name = nameEl.value.trim();
    if (!slug || !name) {
      this.error.set('Slug und Name sind Pflichtfelder.');
      return;
    }

    this.error.set(null);
    try {
      await this.categoryService.updateCategory(category.id, {
        slug,
        name,
        description: descriptionEl.value.trim() || null,
      });

      const file = bannerEl.files?.[0];
      if (file) {
        const url = await this.categoryService.uploadBanner(slug, file);
        await this.categoryService.setCategoryBanner(category.id, url);
      }

      this.editingCategory.set(null);
      this.categories.reload();
    } catch {
      this.error.set('Kategorie konnte nicht gespeichert werden, ist der Slug schon vergeben?');
    }
  }

  protected async runRoundAction(action: () => Promise<void>, failureMessage: string): Promise<void> {
    this.error.set(null);
    this.roundBusy.set(true);
    try {
      await action();
      this.liveRound.reload();
    } catch {
      this.error.set(failureMessage);
    } finally {
      this.roundBusy.set(false);
    }
  }

  protected openCheckin(slug: string): void {
    void this.runRoundAction(() => this.roundControl.openCheckin(slug), 'Check-in konnte nicht geöffnet werden.');
  }

  protected closeCheckin(): void {
    void this.runRoundAction(() => this.roundControl.closeCheckin(), 'Check-in konnte nicht geschlossen werden.');
  }

  protected startVote(): void {
    void this.runRoundAction(() => this.roundControl.startVote(), 'Voting konnte nicht gestartet werden.');
  }

  protected closeVote(): void {
    void this.runRoundAction(() => this.roundControl.closeVote(), 'Voting konnte nicht beendet werden.');
  }

  protected async cancelRound(): Promise<void> {
    if (!(await this.confirmDialog.ask('Aktuelle Runde wirklich abbrechen? Check-in/Voting-Fortschritt geht verloren.'))) {
      return;
    }
    void this.runRoundAction(() => this.roundControl.cancelRound(), 'Runde konnte nicht abgebrochen werden.');
  }

  protected async resetCategory(categoryId: string): Promise<void> {
    if (
      !(await this.confirmDialog.ask(
        'Wirklich alle Bewerbungen dieser Kategorie löschen? Das lässt sich nicht rückgängig machen.',
      ))
    ) {
      return;
    }
    this.error.set(null);
    try {
      await this.applicationService.deleteAllForCategory(categoryId);
      this.applicants.reload();
      this.categories.reload();
    } catch {
      this.error.set('Zurücksetzen fehlgeschlagen.');
    }
  }

  protected async createCategory(
    event: Event,
    slugEl: HTMLInputElement,
    nameEl: HTMLInputElement,
    descriptionEl: HTMLInputElement,
    bannerEl: HTMLInputElement,
  ): Promise<void> {
    event.preventDefault();
    this.error.set(null);

    const slug = slugEl.value.trim();
    const name = nameEl.value.trim();
    if (!slug || !name) {
      this.error.set('Slug und Name sind Pflichtfelder.');
      return;
    }

    try {
      const category = await this.categoryService.createCategory({
        slug,
        name,
        description: descriptionEl.value.trim() || undefined,
      });

      const file = bannerEl.files?.[0];
      if (file) {
        const url = await this.categoryService.uploadBanner(slug, file);
        await this.categoryService.setCategoryBanner(category.id, url);
      }

      slugEl.value = '';
      nameEl.value = '';
      descriptionEl.value = '';
      bannerEl.value = '';
      this.categories.reload();
    } catch {
      this.error.set('Kategorie konnte nicht angelegt werden, ist der Slug schon vergeben?');
    }
  }

  protected async setMatchWinner(matchId: string, winner: MatchWinner): Promise<void> {
    this.error.set(null);
    try {
      await this.matchService.setMatchWinner(matchId, winner);
      this.matches.reload();
    } catch (err) {
      console.error(err);
      this.error.set('Ergebnis konnte nicht gespeichert werden.');
    }
  }

  protected async deleteMatch(matchId: string): Promise<void> {
    if (!(await this.confirmDialog.ask('Dieses Match-Ergebnis wirklich löschen?'))) {
      return;
    }
    this.error.set(null);
    try {
      await this.matchService.deleteMatch(matchId);
      this.matches.reload();
    } catch (err) {
      console.error(err);
      this.error.set('Match konnte nicht gelöscht werden.');
    }
  }
}
