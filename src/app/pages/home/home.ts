import { Component, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CategoryService } from '../../services/category.service';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  templateUrl: './home.html',
})
export class Home {
  private readonly categoryService = inject(CategoryService);

  protected readonly categories = resource({
    loader: () => this.categoryService.getCategories(),
  });
}
