import { Component, DestroyRef, inject, input, resource } from '@angular/core';
import { Router } from '@angular/router';
import { CategoryService } from '../../services/category.service';
import { MatchService } from '../../services/match.service';
import { SupabaseService } from '../../services/supabase.service';
import { AuthService } from '../../services/auth.service';
import { CategoryDetail } from '../category-detail/category-detail';
import { MyApplications } from '../my-applications/my-applications';

/** Der "Captnblacky vs Chat"-Tab: Kategorien, eigene Bewerbungen, bisherige Gegner. */
@Component({
  selector: 'app-home',
  imports: [CategoryDetail, MyApplications],
  templateUrl: './home.html',
})
export class Home {
  private readonly categoryService = inject(CategoryService);
  private readonly matchService = inject(MatchService);
  private readonly router = inject(Router);
  private readonly supabase = inject(SupabaseService);
  protected readonly auth = inject(AuthService);

  // Bindet automatisch an ?kategorie=<slug> (withComponentInputBinding), damit
  // die aufgeklappte Kategorie eine URL hat: teilbar, und der Twitch-Login
  // führt danach wieder zur selben aufgeklappten Kategorie zurück.
  readonly kategorie = input<string>();

  protected readonly categories = resource({
    loader: () => this.categoryService.getCategories(),
  });

  protected readonly matches = resource({
    loader: () => this.matchService.getMatches(),
  });

  /** Nur Matches mit eingetragenem Ergebnis, offene Testeinträge sollen nicht öffentlich auftauchen. */
  protected get decidedMatches() {
    return (this.matches.value() ?? []).filter((match) => match.winner !== null);
  }

  constructor() {
    // Bewerbungszahlen und Ergebnisliste live halten, ohne dass wer die Seite neu laden muss.
    const channel = this.supabase.client
      .channel('home-categories')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => this.categories.reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'applications' }, () => this.categories.reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => this.matches.reload())
      .subscribe();
    inject(DestroyRef).onDestroy(() => void this.supabase.client.removeChannel(channel));
  }

  protected toggleExpand(slug: string): void {
    const next = this.kategorie() === slug ? null : slug;
    void this.router.navigate([], { queryParams: { kategorie: next } });
  }
}
