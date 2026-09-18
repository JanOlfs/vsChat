import { Component, inject, resource, signal } from '@angular/core';
import { CategoryService } from '../../services/category.service';
import { ApplicationService } from '../../services/application.service';
import { RoundControlService } from '../../services/round-control.service';
import { LiveRoundService } from '../../services/live-round.service';
import type { CategoryWithCount } from '../../models/types';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.html',
})
export class Admin {
  private readonly categoryService = inject(CategoryService);
  private readonly applicationService = inject(ApplicationService);
  private readonly roundControl = inject(RoundControlService);
  private readonly liveRoundService = inject(LiveRoundService);

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

  protected async toggleOpen(category: CategoryWithCount): Promise<void> {
    this.error.set(null);
    try {
      await this.categoryService.setCategoryOpen(category.id, !category.is_open);
      this.categories.reload();
    } catch {
      this.error.set('Status konnte nicht geändert werden.');
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

  protected async saveBanner(category: CategoryWithCount, bannerEl: HTMLInputElement): Promise<void> {
    const file = bannerEl.files?.[0];
    if (!file) {
      return;
    }
    this.error.set(null);
    try {
      const url = await this.categoryService.uploadBanner(category.slug, file);
      await this.categoryService.setCategoryBanner(category.id, url);
      bannerEl.value = '';
      this.categories.reload();
    } catch {
      this.error.set('Banner konnte nicht hochgeladen werden.');
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

  protected async resetCategory(categoryId: string): Promise<void> {
    if (!confirm('Wirklich alle Bewerbungen dieser Kategorie löschen? Das lässt sich nicht rückgängig machen.')) {
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
}
