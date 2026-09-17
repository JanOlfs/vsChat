import { Component, inject, input, resource, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { CategoryService } from '../../services/category.service';
import { ApplicationService } from '../../services/application.service';
import type { ApplicationWithProfile } from '../../models/types';

@Component({
  selector: 'app-category-detail',
  templateUrl: './category-detail.html',
})
export class CategoryDetail {
  private readonly router = inject(Router);
  private readonly categoryService = inject(CategoryService);
  private readonly applicationService = inject(ApplicationService);
  protected readonly auth = inject(AuthService);

  readonly slug = input.required<string>();

  protected readonly actionError = signal<string | null>(null);

  protected readonly category = resource({
    params: () => ({ slug: this.slug() }),
    loader: ({ params }) => this.categoryService.getCategoryBySlug(params.slug),
  });

  protected readonly applications = resource({
    params: () => {
      const category = this.category.value();
      return category ? { categoryId: category.id } : undefined;
    },
    loader: ({ params }) => this.applicationService.getApplicationsForCategory(params.categoryId),
  });

  protected myApplication(): ApplicationWithProfile | undefined {
    const profileId = this.auth.currentProfile()?.id;
    if (!profileId) {
      return undefined;
    }
    return this.applications.value()?.find((application) => application.profile_id === profileId);
  }

  protected async apply(): Promise<void> {
    const category = this.category.value();
    const profile = this.auth.currentProfile();
    if (!category) {
      return;
    }
    if (!profile) {
      await this.auth.loginWithTwitch(this.router.url);
      return;
    }

    this.actionError.set(null);
    const optimistic: ApplicationWithProfile = {
      id: `optimistic-${Date.now()}`,
      profile_id: profile.id,
      category_id: category.id,
      note: null,
      created_at: new Date().toISOString(),
      profile,
    };
    this.applications.update((list) => [...(list ?? []), optimistic]);

    try {
      const saved = await this.applicationService.apply(profile.id, category.id);
      this.applications.update((list) =>
        (list ?? []).map((application) => (application.id === optimistic.id ? saved : application)),
      );
    } catch {
      this.applications.update((list) => (list ?? []).filter((application) => application.id !== optimistic.id));
      this.actionError.set('Bewerbung konnte nicht gespeichert werden.');
    }
  }

  protected async withdraw(): Promise<void> {
    const application = this.myApplication();
    if (!application) {
      return;
    }

    this.actionError.set(null);
    this.applications.update((list) => (list ?? []).filter((entry) => entry.id !== application.id));

    try {
      await this.applicationService.withdraw(application.id);
    } catch {
      this.applications.update((list) => [...(list ?? []), application]);
      this.actionError.set('Bewerbung konnte nicht zurückgezogen werden.');
    }
  }
}
