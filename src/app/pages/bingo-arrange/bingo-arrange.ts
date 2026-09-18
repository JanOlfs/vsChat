import { Component, DestroyRef, inject, input, resource, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BingoService } from '../../services/bingo.service';
import { AuthService } from '../../services/auth.service';
import type { BingoCellWithDetails } from '../../models/types';

const POLL_INTERVAL_MS = 2000;
const UNIQUE_VIOLATION = '23505';

@Component({
  selector: 'app-bingo-arrange',
  templateUrl: './bingo-arrange.html',
})
export class BingoArrange {
  private readonly bingoService = inject(BingoService);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  readonly id = input.required<string>();

  protected readonly error = signal<string | null>(null);

  protected readonly board = resource({
    params: () => this.id(),
    loader: ({ params }) => this.bingoService.getBoard(params),
  });

  protected readonly categories = resource({
    params: () => this.id(),
    loader: ({ params }) => this.bingoService.getCategories(params),
  });

  protected readonly cells = resource({
    params: () => this.id(),
    loader: ({ params }) => this.bingoService.getCells(params),
  });

  constructor() {
    // Falls der andere Spieler währenddessen startet, soll das hier auffallen
    // (Hinweis + Wechsel-Button), ohne dass man selbst neu laden muss.
    const interval = setInterval(() => this.board.reload(), POLL_INTERVAL_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(interval));
  }

  protected get overlayUrl(): string {
    return `${window.location.origin}/bingo/${this.id()}/overlay`;
  }

  protected get allCellsFilled(): boolean {
    return (this.cells.value() ?? []).every((cell) => cell.category_id !== null);
  }

  /** Pool ohne die Kategorien, die schon auf einem Feld liegen. */
  protected get unassignedCategories() {
    const placedIds = new Set((this.cells.value() ?? []).map((cell) => cell.category_id).filter(Boolean));
    return (this.categories.value() ?? []).filter((category) => !placedIds.has(category.id));
  }

  protected goToPlay(): void {
    void this.router.navigate(['/bingo', this.id(), 'play']);
  }

  protected onDragStart(event: DragEvent, categoryId: string): void {
    event.dataTransfer?.setData('text/plain', categoryId);
  }

  protected async onDrop(event: DragEvent, cell: BingoCellWithDetails): Promise<void> {
    event.preventDefault();
    const categoryId = event.dataTransfer?.getData('text/plain');
    if (!categoryId) {
      return;
    }
    this.error.set(null);
    try {
      await this.bingoService.assignCategoryToCell(cell.id, categoryId);
      this.cells.reload();
    } catch (err) {
      console.error(err);
      const code = (err as { code?: string } | null)?.code;
      this.error.set(
        code === UNIQUE_VIOLATION
          ? 'Diese Kategorie liegt schon an anderer Stelle auf dem Board.'
          : 'Zelle konnte nicht geändert werden.',
      );
    }
  }

  protected async clearCell(cell: BingoCellWithDetails): Promise<void> {
    if (!cell.category_id) {
      return;
    }
    this.error.set(null);
    try {
      await this.bingoService.assignCategoryToCell(cell.id, null);
      this.cells.reload();
    } catch (err) {
      console.error(err);
      this.error.set('Zelle konnte nicht geändert werden.');
    }
  }

  protected async addCategory(event: Event, labelEl: HTMLInputElement): Promise<void> {
    event.preventDefault();
    const label = labelEl.value.trim();
    if (!label) {
      return;
    }
    this.error.set(null);
    try {
      await this.bingoService.addCategory(this.id(), label);
      labelEl.value = '';
      this.categories.reload();
    } catch (err) {
      console.error(err);
      this.error.set('Kategorie konnte nicht angelegt werden.');
    }
  }

  protected async deleteCategory(categoryId: string): Promise<void> {
    this.error.set(null);
    try {
      await this.bingoService.deleteCategory(categoryId);
      this.categories.reload();
      this.cells.reload();
    } catch (err) {
      console.error(err);
      this.error.set('Kategorie konnte nicht gelöscht werden.');
    }
  }

  protected async startBoard(): Promise<void> {
    this.error.set(null);
    try {
      await this.bingoService.setBoardStatus(this.id(), 'active');
      this.board.reload();
    } catch (err) {
      console.error(err);
      this.error.set('Spiel konnte nicht gestartet werden.');
    }
  }

  /** Nimmt alle Kategorien vom Grid (zurück in den Pool), löscht keine Kategorien. */
  protected async clearGrid(): Promise<void> {
    if (!confirm('Wirklich alle Felder leeren? Die Kategorien selbst bleiben erhalten, landen nur wieder im Pool.')) {
      return;
    }
    this.error.set(null);
    try {
      await this.bingoService.clearGrid(this.id());
      this.cells.reload();
    } catch (err) {
      console.error(err);
      this.error.set('Grid konnte nicht geleert werden.');
    }
  }

  protected async deleteBoard(): Promise<void> {
    if (!confirm('Spielfläche wirklich löschen? Das lässt sich nicht rückgängig machen.')) {
      return;
    }
    this.error.set(null);
    try {
      await this.bingoService.deleteBoard(this.id());
      void this.router.navigate(['/bingo']);
    } catch (err) {
      console.error(err);
      this.error.set('Spielfläche konnte nicht gelöscht werden.');
    }
  }
}
