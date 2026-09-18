import { AfterViewInit, Directive, ElementRef, OnDestroy, inject } from '@angular/core';

const MIN_FONT_PX = 10;
const STEP_PX = 1;

/**
 * Verkleinert die Schrift des Elements schrittweise, bis der Inhalt wieder in
 * die Box passt (per ResizeObserver/MutationObserver neu geprüft). Für die
 * Bingo-Zellen/-Kacheln gedacht, wo ein einzelnes sehr langes Wort sonst
 * mitten im Wort umbricht statt einfach kleiner zu werden.
 *
 * Prüft die "passt es rein"-Frage nicht über scrollHeight/clientHeight am
 * Element selbst: bei overflow:hidden (und teils auch ohne) liefert das in
 * der Praxis oft schlicht clientHeight zurück, auch wenn der Inhalt sichtbar
 * überläuft. Stattdessen rendert eine unsichtbare Sonde mit fester Breite und
 * height:auto denselben Text, deren natürliche Höhe ist eindeutig.
 *
 * ponytail: einfache Schleife statt Binärsuche, bei max. ~1rem Startgröße
 * sind das ein paar Iterationen, keine Optimierung nötig.
 */
@Directive({
  selector: '[appAutoFitText]',
})
export class AutoFitTextDirective implements AfterViewInit, OnDestroy {
  private readonly el: HTMLElement = inject(ElementRef).nativeElement;
  private probe: HTMLElement | null = null;
  private resizeObserver?: ResizeObserver;
  private mutationObserver?: MutationObserver;
  private baseFontSizePx: number | null = null;

  ngAfterViewInit(): void {
    this.baseFontSizePx = parseFloat(getComputedStyle(this.el).fontSize);
    this.probe = this.createProbe();
    document.body.appendChild(this.probe);
    this.fit();

    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.resizeObserver.observe(this.el);

    this.mutationObserver = new MutationObserver(() => this.fit());
    this.mutationObserver.observe(this.el, { characterData: true, childList: true, subtree: true });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.mutationObserver?.disconnect();
    this.probe?.remove();
  }

  private createProbe(): HTMLElement {
    const probe = document.createElement('div');
    probe.style.position = 'fixed';
    probe.style.left = '-9999px';
    probe.style.top = '0';
    probe.style.visibility = 'hidden';
    probe.style.overflowWrap = 'anywhere';
    probe.style.boxSizing = 'border-box';
    return probe;
  }

  private fit(): void {
    if (this.baseFontSizePx === null || !this.probe) {
      return;
    }
    const targetWidth = this.el.clientWidth;
    const targetHeight = this.el.clientHeight;
    if (targetWidth === 0 || targetHeight === 0) {
      return;
    }

    const cs = getComputedStyle(this.el);
    this.probe.style.width = `${targetWidth}px`;
    this.probe.style.fontFamily = cs.fontFamily;
    this.probe.style.lineHeight = cs.lineHeight;
    this.probe.style.letterSpacing = cs.letterSpacing;
    this.probe.textContent = this.el.textContent;

    let size = this.baseFontSizePx;
    this.probe.style.fontSize = `${size}px`;
    while (size > MIN_FONT_PX && this.probe.getBoundingClientRect().height > targetHeight) {
      size -= STEP_PX;
      this.probe.style.fontSize = `${size}px`;
    }
    this.el.style.fontSize = `${size}px`;
  }
}
