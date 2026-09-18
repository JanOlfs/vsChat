import { Injectable, signal } from '@angular/core';

interface ConfirmRequest {
  message: string;
  resolve: (value: boolean) => void;
}

/** Ersetzt das native confirm(), damit der Dialog zum restlichen Design passt. */
@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  private readonly _request = signal<ConfirmRequest | null>(null);
  readonly request = this._request.asReadonly();

  ask(message: string): Promise<boolean> {
    return new Promise((resolve) => this._request.set({ message, resolve }));
  }

  respond(value: boolean): void {
    this._request()?.resolve(value);
    this._request.set(null);
  }
}
