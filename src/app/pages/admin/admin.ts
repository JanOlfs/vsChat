import { Component, inject, resource, signal } from '@angular/core';
import { CategoryService } from '../../services/category.service';
import type { CategoryWithCount } from '../../models/types';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.html',
})
export class Admin {
  private readonly categoryService = inject(CategoryService);

  protected readonly categories = resource({
    loader: () => this.categoryService.getCategories(),
  });

  protected readonly error = signal<string | null>(null);

  protected async toggleOpen(category: CategoryWithCount): Promise<void> {
    this.error.set(null);
    try {
      await this.categoryService.setCategoryOpen(category.id, !category.is_open);
      this.categories.reload();
    } catch {
      this.error.set('Status konnte nicht geändert werden.');
    }
  }

  protected async createCategory(
    event: Event,
    slugEl: HTMLInputElement,
    nameEl: HTMLInputElement,
    descriptionEl: HTMLInputElement,
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
      await this.categoryService.createCategory({ slug, name, description: descriptionEl.value.trim() || undefined });
      slugEl.value = '';
      nameEl.value = '';
      descriptionEl.value = '';
      this.categories.reload();
    } catch {
      this.error.set('Kategorie konnte nicht angelegt werden, ist der Slug schon vergeben?');
    }
  }
}
