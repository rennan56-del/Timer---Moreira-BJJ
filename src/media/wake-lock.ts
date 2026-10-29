export class ScreenAwake {
  private lock?: WakeLockSentinel;
  private wanted = false;
  private pending = false;
  constructor(private onChange: (message: string) => void) {}
  async set(active: boolean): Promise<void> {
    this.wanted = active;
    if (!active) {
      const current = this.lock; this.lock = undefined;
      try { await current?.release(); } catch { /* OS may have released it. */ }
      this.onChange('Tela: proteção em espera'); return;
    }
    if (document.hidden || this.pending || this.lock && !this.lock.released) return;
    if (!('wakeLock' in navigator)) { this.onChange('Desative o bloqueio automático da tela'); return; }
    this.pending = true;
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (!this.wanted || document.hidden) { await lock.release(); return; }
      this.lock = lock; this.onChange('Tela mantida ativa');
      lock.addEventListener('release', () => {
        if (this.lock === lock) { this.lock = undefined; this.onChange('Tela liberada pelo sistema; confira o bloqueio automático'); }
      });
    } catch { this.onChange('Desative o bloqueio automático da tela'); }
    finally { this.pending = false; }
  }
}
