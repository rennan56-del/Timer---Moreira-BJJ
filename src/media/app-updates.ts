export const APP_VERSION = '1.5.0';
interface UpdateOptions {
  isTrainingActive(): boolean;
  notify(message: string): void;
  onReady?(): void;
}
interface UpdateResult { type: 'UPDATE_RESULT'; requestId: string; result: 'approved' | 'blocked' | 'error'; reason?: string }
/** Explicit updates only. A controller change in another tab never reloads us. */
export class AppUpdates {
  private registration?: ServiceWorkerRegistration;
  private container?: ServiceWorkerContainer;
  private checking = false;
  private applying = '';
  private approved = false;
  private controllerChanged = false;
  private applyTimer?: ReturnType<typeof setTimeout>;
  private readonly message = (event: MessageEvent): void => {
    const result = event.data as UpdateResult | undefined;
    if (result?.type !== 'UPDATE_RESULT' || result.requestId !== this.applying) return;
    if (result.result === 'approved') {
      this.approved = true;
      this.tryReload();
    } else {
      this.clearApplication();
      this.options.notify(result.reason || 'Atualização adiada. Finalize os treinos e feche outras abas do timer antes de tentar novamente.');
    }
  };
  private readonly changed = (): void => {
    if (!this.applying) return;
    this.controllerChanged = true;
    this.tryReload();
  };
  constructor(private options: UpdateOptions) {
    try { this.container = typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? navigator.serviceWorker : undefined; }
    catch { this.container = undefined; }
    this.container?.addEventListener('message',this.message);
    this.container?.addEventListener('controllerchange',this.changed);
  }
  attach(registration: ServiceWorkerRegistration): void {
    if (this.registration === registration) return;
    this.registration = registration;
    if (registration.waiting) this.options.onReady?.();
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && registration.waiting) this.options.onReady?.();
      });
    });
  }
  async check(): Promise<void> {
    if (this.checking || this.applying) { this.options.notify('Já estamos verificando a atualização. Aguarde alguns instantes.'); return; }
    if (this.options.isTrainingActive()) { this.options.notify('Finalize o treino antes de atualizar o app. O tempo e os rounds foram preservados.'); return; }
    if (!this.container) { this.options.notify('Atualização automática indisponível. Abra o aplicativo por HTTPS ou localhost e recarregue após finalizar o treino.'); return; }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { this.options.notify('Você está offline. Conecte-se para verificar atualizações; o cronômetro continua disponível.'); return; }
    this.checking = true;
    try {
      if (!this.registration) {
        const registration = await this.container.getRegistration();
        if (registration) this.attach(registration);
      }
      const registration = this.registration;
      if (!registration) { this.options.notify('Não há atualização instalada nesta origem. Use a versão de produção por HTTPS ou localhost.'); return; }
      this.options.notify('Verificando atualizações do aplicativo…');
      await this.bounded(registration.update(),5000);
      if (registration.installing) await this.waitForInstallation(registration.installing);
      if (this.options.isTrainingActive()) { this.options.notify('Atualização adiada: o treino continua. Tente novamente depois de encerrá-lo.'); return; }
      const waiting = registration.waiting;
      if (!waiting) { this.options.notify(`Você está na versão ${APP_VERSION}. Nenhuma atualização está pronta para aplicar.`); return; }
      this.applying = `moreira-update-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      this.approved = false; this.controllerChanged = false;
      this.applyTimer = setTimeout(() => {
        if (!this.applying) return;
        this.clearApplication();
        this.options.notify('A atualização não foi confirmada. Finalize os treinos e feche outras abas do timer antes de tentar novamente.');
      },6000);
      // The waiting worker independently verifies every scoped window, including
      // tabs with older code. No answer from any tab means no activation.
      waiting.postMessage({ type:'APPLY_UPDATE',requestId:this.applying });
    } catch {
      this.clearApplication();
      this.options.notify('Não foi possível verificar a atualização. Confira a conexão e tente novamente; seus dados foram mantidos.');
    } finally { this.checking = false; }
  }
  private tryReload(): void {
    if (!this.applying || !this.approved || !this.controllerChanged) return;
    if (this.options.isTrainingActive()) {
      this.clearApplication();
      this.options.notify('A nova versão está pronta. O treino atual foi preservado; recarregue somente depois de encerrá-lo.');
      return;
    }
    this.clearApplication();
    if (typeof window !== 'undefined') {
      try { window.location.reload(); }
      catch { this.options.notify('A nova versão está pronta. Recarregue a página manualmente após finalizar o treino.'); }
    }
  }
  private clearApplication(): void {
    if (this.applyTimer !== undefined) clearTimeout(this.applyTimer);
    this.applyTimer = undefined; this.applying = ''; this.approved = false; this.controllerChanged = false;
  }
  private async bounded<T>(promise: Promise<T>,milliseconds: number): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([promise,new Promise<T>((_,reject) => { timeout = setTimeout(() => reject(new Error('update timeout')),milliseconds); })]);
    } finally { if (timeout !== undefined) clearTimeout(timeout); }
  }
  private waitForInstallation(worker: ServiceWorker): Promise<void> {
    if (worker.state === 'installed' || worker.state === 'activated' || worker.state === 'redundant') return Promise.resolve();
    return new Promise(resolve => {
      const finish = () => { clearTimeout(timeout); worker.removeEventListener('statechange',changed); resolve(); };
      const changed = () => { if (['installed','activated','redundant'].includes(worker.state)) finish(); };
      const timeout = setTimeout(finish,5000);
      worker.addEventListener('statechange',changed);
    });
  }
  dispose(): void {
    this.clearApplication();
    this.container?.removeEventListener('message',this.message);
    this.container?.removeEventListener('controllerchange',this.changed);
  }
}
