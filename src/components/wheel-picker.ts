/** Native compositor scrolling; only nearby rows are mounted, even for 1,441 minutes. */
export class WheelPicker {
  static readonly rowHeight = 40;
  private input: HTMLInputElement;
  private track: HTMLElement;
  private timer?: ReturnType<typeof setTimeout>;
  private frame = 0;
  private value: number;
  private min: number;
  private max: number;
  private center = -1;
  private touching = false;
  private controller = new AbortController();
  constructor(private element: HTMLElement) {
    this.input = element.querySelector('input')!;
    this.track = element.querySelector('.wheel-track')!;
    this.min = Number(element.dataset.min); this.max = Number(element.dataset.max);
    this.value = Number(this.input.value);
    this.track.style.height = `${(this.max - this.min + Number(element.dataset.rows || 3)) * WheelPicker.rowHeight}px`;
    this.element.scrollTop = (this.value - this.min) * WheelPicker.rowHeight;
    this.paint();
    const options = { signal: this.controller.signal };
    element.addEventListener('scroll', () => {
      if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.paint(); });
      clearTimeout(this.timer); this.timer = setTimeout(() => this.settle(), 140);
    }, { ...options, passive: true });
    element.addEventListener('touchstart', () => { this.touching = true; clearTimeout(this.timer); }, { ...options, passive:true });
    const release = () => { this.touching = false; clearTimeout(this.timer); this.timer = setTimeout(() => this.settle(),140); };
    element.addEventListener('touchend', release, { ...options, passive:true });
    element.addEventListener('touchcancel', release, { ...options, passive:true });
    element.addEventListener('scrollend', () => this.settle(), options);
    element.addEventListener('keydown', event => {
      const changes: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10 };
      let next = changes[event.key] === undefined ? undefined : this.nearest() + changes[event.key];
      if (event.key === 'Home') next = this.min;
      if (event.key === 'End') next = this.max;
      if (next === undefined) return;
      event.preventDefault(); this.move(next);
    }, options);
    this.track.addEventListener('click', event => {
      const row = (event.target as HTMLElement).closest<HTMLElement>('[data-value]');
      if (row) this.move(Number(row.dataset.value));
      else {
        const offset = (Number(this.element.dataset.rows || 3)-1)/2;
        this.move(this.min + Math.floor((this.element.scrollTop+event.clientY-this.element.getBoundingClientRect().top)/WheelPicker.rowHeight)-offset);
      }
    }, options);
  }
  private nearest(): number {
    return Math.max(this.min, Math.min(this.max, this.min + Math.round(this.element.scrollTop / WheelPicker.rowHeight)));
  }
  private move(value: number): void {
    const top = (Math.max(this.min, Math.min(this.max,value)) - this.min) * WheelPicker.rowHeight;
    this.element.scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches || Math.abs(top-this.element.scrollTop)>200 ? 'instant' : 'smooth' });
  }
  private paint(): void {
    const value = this.nearest();
    this.value = value; this.input.value = String(value);
    this.element.setAttribute('aria-valuenow', String(value));
    if (this.center === value) return;
    this.center = value;
    const rows = document.createDocumentFragment();
    for (let n = Math.max(this.min,value-5); n <= Math.min(this.max,value+5); n++) {
      const row = document.createElement('div'); row.className = 'wheel-row';
      row.dataset.value = String(n); row.setAttribute('aria-hidden','true');
      row.style.top = `${(n - this.min + (Number(this.element.dataset.rows || 3)-1)/2) * WheelPicker.rowHeight}px`;
      row.textContent = String(n).padStart(2,'0'); row.classList.toggle('selected',n === value); rows.append(row);
    }
    this.track.replaceChildren(rows);
  }
  private settle(force = false): void {
    if (this.touching && !force) return;
    clearTimeout(this.timer); this.paint();
    const top = (this.value - this.min) * WheelPicker.rowHeight;
    if (Math.abs(this.element.scrollTop - top) > .5) this.element.scrollTo({top,behavior:'instant'});
  }
  /** Save reads the position synchronously, even during a fling or before scrollend. */
  flush(): void { this.settle(true); }
  dispose(): void { this.controller.abort(); clearTimeout(this.timer); cancelAnimationFrame(this.frame); }
}
export function wheelMarkup(name: string, label: string, value: number, min: number, max: number, rows = 3): string {
  return `<div class="wheel-field"><span id="${name}-label">${label}</span><div class="wheel-picker" role="spinbutton" tabindex="0" aria-labelledby="${name}-label" aria-valuemin="${min}" aria-valuemax="${max}" aria-valuenow="${value}" data-rows="${rows}" data-min="${min}" data-max="${max}" data-wheel="${name}"><input type="hidden" name="${name}" value="${value}"/><div class="wheel-track"></div></div></div>`;
}
