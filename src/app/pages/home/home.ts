import { Component, inject, input, resource } from '@angular/core';
import { Router } from '@angular/router';
import { CategoryService } from '../../services/category.service';
import { CategoryDetail } from '../category-detail/category-detail';

@Component({
  selector: 'app-home',
  imports: [CategoryDetail],
  templateUrl: './home.html',
})
export class Home {
  private readonly categoryService = inject(CategoryService);
  private readonly router = inject(Router);

  // Bindet automatisch an ?kategorie=<slug> (withComponentInputBinding), damit
  // die aufgeklappte Kategorie eine URL hat: teilbar, und der Twitch-Login
  // führt danach wieder zur selben aufgeklappten Kategorie zurück.
  readonly kategorie = input<string>();

  protected readonly categories = resource({
    loader: () => this.categoryService.getCategories(),
  });

  protected toggleExpand(slug: string): void {
    const next = this.kategorie() === slug ? null : slug;
    void this.router.navigate([], { queryParams: { kategorie: next } });
  }
}
