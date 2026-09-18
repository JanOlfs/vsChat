import { Component, inject, input, resource, signal } from '@angular/core';
import { BingoService } from '../../services/bingo.service';
import type { BingoCellWithDetails } from '../../models/types';

@Component({
  selector: 'app-bingo-arrange',
  templateUrl: './bingo-arrange.html',
})
export class BingoArrange {
  private readonly bingoService = inject(BingoService);

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

  protected get overlayUrl(): string {
    return `${window.location.origin}/bingo/${this.id()}/overlay`;
  }

  protected get allCellsFilled(): boolean {
    return (this.cells.value() ?? []).every((cell) => cell.category_id !== null);
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
      this.error.set('Zelle konnte nicht geändert werden.');
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

  protected async finishBoard(): Promise<void> {
    if (!confirm('Spielfläche wirklich beenden? Danach können keine Felder mehr geclaimt werden.')) {
      return;
    }
    this.error.set(null);
    try {
      await this.bingoService.setBoardStatus(this.id(), 'finished');
      this.board.reload();
    } catch (err) {
      console.error(err);
      this.error.set('Spiel konnte nicht beendet werden.');
    }
  }
}
