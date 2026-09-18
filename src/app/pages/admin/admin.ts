import { Component, inject, resource, signal } from '@angular/core';
import { CategoryService } from '../../services/category.service';
import { ApplicationService } from '../../services/application.service';
import type { CategoryWithCount } from '../../models/types';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.html',
})
export class Admin {
  private readonly categoryService = inject(CategoryService);
  private readonly applicationService = inject(ApplicationService);

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

  protected async saveBanner(categoryId: string, bannerEl: HTMLInputElement): Promise<void> {
    this.error.set(null);
    try {
      await this.categoryService.setCategoryBanner(categoryId, bannerEl.value.trim() || null);
      this.categories.reload();
    } catch {
      this.error.set('Banner-URL konnte nicht gespeichert werden.');
    }
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
      await this.categoryService.createCategory({
        slug,
        name,
        description: descriptionEl.value.trim() || undefined,
        banner_url: bannerEl.value.trim() || undefined,
      });
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
