import { Component, DestroyRef, inject, input, resource } from '@angular/core';
import { Router } from '@angular/router';
import { CategoryService } from '../../services/category.service';
import { SupabaseService } from '../../services/supabase.service';
import { CategoryDetail } from '../category-detail/category-detail';

@Component({
  selector: 'app-home',
  imports: [CategoryDetail],
  templateUrl: './home.html',
})
export class Home {
  private readonly categoryService = inject(CategoryService);
  private readonly router = inject(Router);
  private readonly supabase = inject(SupabaseService);

  // Bindet automatisch an ?kategorie=<slug> (withComponentInputBinding), damit
  // die aufgeklappte Kategorie eine URL hat: teilbar, und der Twitch-Login
  // führt danach wieder zur selben aufgeklappten Kategorie zurück.
  readonly kategorie = input<string>();

  protected readonly categories = resource({
    loader: () => this.categoryService.getCategories(),
  });

  constructor() {
    // Bewerbungszahlen live halten, ohne dass wer die Seite neu laden muss.
    const channel = this.supabase.client
      .channel('home-categories')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => this.categories.reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'applications' }, () => this.categories.reload())
      .subscribe();
    inject(DestroyRef).onDestroy(() => void this.supabase.client.removeChannel(channel));
  }

  protected toggleExpand(slug: string): void {
    const next = this.kategorie() === slug ? null : slug;
    void this.router.navigate([], { queryParams: { kategorie: next } });
  }
}
