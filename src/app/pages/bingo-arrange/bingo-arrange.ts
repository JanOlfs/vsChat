import { Component, DestroyRef, effect, inject, input, resource, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BingoService } from '../../services/bingo.service';
import { AuthService } from '../../services/auth.service';
import { SupabaseService } from '../../services/supabase.service';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';
import { AutoFitTextDirective } from '../../directives/auto-fit-text.directive';
import type { BingoCellWithDetails } from '../../models/types';

// Realtime hält uns aktuell, das hier ist nur das Sicherheitsnetz falls eine
// Verbindung mal hängt (z.B. Laptop kurz im Standby).
const FALLBACK_POLL_INTERVAL_MS = 30000;
const UNIQUE_VIOLATION = '23505';

@Component({
  selector: 'app-bingo-arrange',
  imports: [AutoFitTextDirective],
  templateUrl: './bingo-arrange.html',
})
export class BingoArrange {
  private readonly bingoService = inject(BingoService);
  private readonly router = inject(Router);
  private readonly supabase = inject(SupabaseService);
  private readonly confirmDialog = inject(ConfirmDialogService);
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
    // In einem effect(), weil das required input `id` beim Konstruktor-Lauf
    // noch keinen Wert hat, per onCleanup wird der Channel bei einer
    // id-Änderung oder Komponenten-Zerstörung sauber wieder abgebaut.
    effect((onCleanup) => {
      const boardId = this.id();
      const channel = this.supabase.client
        .channel(`bingo-arrange-${boardId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'bingo_boards', filter: `id=eq.${boardId}` },
          () => this.board.reload(),
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'bingo_cells', filter: `board_id=eq.${boardId}` },
          () => this.cells.reload(),
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'bingo_categories', filter: `board_id=eq.${boardId}` },
          () => this.categories.reload(),
        )
        .subscribe();
      onCleanup(() => void this.supabase.client.removeChannel(channel));
    });

    const interval = setInterval(() => this.board.reload(), FALLBACK_POLL_INTERVAL_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(interval));

    // Sobald die Spielfläche (durch wen auch immer) gestartet wurde, folgt
    // jeder, der hier noch auf der Anordnen-Seite sitzt, automatisch zum
    // Spielen, ohne selbst klicken zu müssen.
    effect(() => {
      const board = this.board.value();
      if (board && board.status !== 'setup') {
        void this.router.navigate(['/bingo', this.id(), 'play']);
      }
    });

    // Wurde die Spielfläche (von wem auch immer) gelöscht, fliegt man zurück
    // zur Übersicht statt auf einer leeren Seite hängen zu bleiben.
    effect(() => {
      if (!this.board.isLoading() && this.board.value() === null) {
        void this.router.navigate(['/bingo']);
      }
    });
  }

  protected readonly overlayLinkCopied = signal(false);

  protected get overlayUrl(): string {
    return `${window.location.origin}/bingo/${this.id()}/overlay`;
  }

  protected async copyOverlayLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.overlayUrl);
      this.overlayLinkCopied.set(true);
      setTimeout(() => this.overlayLinkCopied.set(false), 1500);
    } catch (err) {
      console.error(err);
      this.error.set('Link konnte nicht kopiert werden.');
    }
  }

  protected get allCellsFilled(): boolean {
    return (this.cells.value() ?? []).every((cell) => cell.category_id !== null);
  }

  /** Pool ohne die Kategorien, die schon auf einem Feld liegen. */
  protected get unassignedCategories() {
    const placedIds = new Set((this.cells.value() ?? []).map((cell) => cell.category_id).filter(Boolean));
    return (this.categories.value() ?? []).filter((category) => !placedIds.has(category.id));
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
    await this.assignCategory(cell, categoryId);
  }

  // Tap-to-place als Fallback für Touch-Geräte, auf denen die native
  // HTML5-Drag&Drop-API (dragstart/drop) nicht funktioniert: erst eine
  // Kategorie aus dem Pool antippen, dann ein Feld antippen.
  protected readonly selectedCategoryId = signal<string | null>(null);

  protected onPoolTileClick(categoryId: string): void {
    this.selectedCategoryId.set(this.selectedCategoryId() === categoryId ? null : categoryId);
  }

  protected async onCellClick(cell: BingoCellWithDetails): Promise<void> {
    const categoryId = this.selectedCategoryId();
    if (!categoryId) {
      return;
    }
    this.selectedCategoryId.set(null);
    await this.assignCategory(cell, categoryId);
  }

  private async assignCategory(cell: BingoCellWithDetails, categoryId: string): Promise<void> {
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
      this.board.reload(); // löst den Auto-Wechsel-Effect gleich aus, nicht erst beim nächsten Poll
    } catch (err) {
      console.error(err);
      this.error.set('Spiel konnte nicht gestartet werden.');
    }
  }

  /** Nimmt alle Kategorien vom Grid (zurück in den Pool), löscht keine Kategorien. */
  protected async clearGrid(): Promise<void> {
    if (
      !(await this.confirmDialog.ask(
        'Wirklich alle Felder leeren? Die Kategorien selbst bleiben erhalten, landen nur wieder im Pool.',
      ))
    ) {
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
    if (!(await this.confirmDialog.ask('Spielfläche wirklich löschen? Das lässt sich nicht rückgängig machen.'))) {
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
