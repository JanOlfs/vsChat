import { Component, inject, resource, signal } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { ApplicationService } from '../../services/application.service';
import type { ApplicationWithCategory } from '../../models/types';

@Component({
  selector: 'app-my-applications',
  templateUrl: './my-applications.html',
})
export class MyApplications {
  private readonly applicationService = inject(ApplicationService);
  protected readonly auth = inject(AuthService);

  protected readonly error = signal<string | null>(null);

  protected readonly applications = resource({
    params: () => {
      const profileId = this.auth.currentProfile()?.id;
      return profileId ? { profileId } : undefined;
    },
    loader: ({ params }) => this.applicationService.getMyApplications(params.profileId),
  });

  protected async withdraw(application: ApplicationWithCategory): Promise<void> {
    this.error.set(null);
    this.applications.update((list) => (list ?? []).filter((entry) => entry.id !== application.id));

    try {
      await this.applicationService.withdraw(application.id);
    } catch {
      this.applications.update((list) => [...(list ?? []), application]);
      this.error.set('Bewerbung konnte nicht zurückgezogen werden.');
    }
  }
}
