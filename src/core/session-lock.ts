import type { SessionStorage } from '../storage/session.ts';
export const WORKOUT_LOCK_KEY = 'moreira-bjj:workout-owner:v1';
const LOCK_NAME = 'moreira-bjj:active-workout:v1';
interface LockProvider {
  request(name: string, options: { mode: 'exclusive'; ifAvailable: true }, callback: (lock: unknown | null) => Promise<void>): Promise<unknown>;
}
interface Ownership { version: 1; owner: string; heartbeat: number }
export interface WorkoutLockOptions {
  storage?: SessionStorage;
  locks?: LockProvider | null;
  owner?: string;
  now?: () => number;
  heartbeatMs?: number;
  settleMs?: number;
}
/** Web Locks is atomic. The storage fallback is conservative and never steals an
 * old heartbeat: an Android tab can be alive even when its timers are suspended.
 * Consumers must check `owned` before updating the engine or playing a signal. */
export class WorkoutLock {
  private held = false;
  private method: 'web' | 'storage' | undefined;
  private releaseWeb?: () => void;
  /** Resolves only after the browser has actually released this instance's
   * native lock, not merely after its callback release gate was resolved. */
  private nativeCompletion?: Promise<void>;
  private heartbeat?: ReturnType<typeof setInterval>;
  private pending?: Promise<boolean>;
  private generation = 0;
  private storage?: SessionStorage;
  private locks?: LockProvider | null;
  private owner: string;
  private now: () => number;
  private heartbeatMs: number;
  private settleMs: number;
  reason = '';
  constructor(options: WorkoutLockOptions = {}) {
    this.owner = options.owner || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
    this.now = options.now || (() => Date.now());
    this.heartbeatMs = options.heartbeatMs ?? 2000;
    this.settleMs = options.settleMs ?? 120;
    if ('storage' in options) this.storage = options.storage;
    else { try { this.storage = typeof localStorage !== 'undefined' ? localStorage : undefined; } catch { this.storage = undefined; } }
    this.locks = 'locks' in options ? options.locks : typeof navigator !== 'undefined' ? navigator.locks as unknown as LockProvider : undefined;
  }
  get owned(): boolean {
    if (!this.held) return false;
    if (this.method === 'storage') {
      try {
        if (this.readOwner()?.owner !== this.owner) { this.lose('Outro timer assumiu o controle. Esta sessão foi interrompida para evitar sons duplicados.'); return false; }
      } catch { this.lose('Não foi possível confirmar a exclusividade do timer. Confira o armazenamento do navegador.'); return false; }
    }
    return this.held;
  }
  acquire(): Promise<boolean> {
    if (this.owned) return Promise.resolve(true);
    if (this.pending) return this.pending;
    const generation = ++this.generation;
    const pending = this.tryAcquire(generation);
    this.pending = pending;
    void pending.finally(() => { if (this.pending === pending) this.pending = undefined; });
    return pending;
  }
  private async tryAcquire(generation: number): Promise<boolean> {
    this.reason = '';
    if (this.locks?.request) {
      // Resolving the callback's hold gate is not the same as the native lock
      // being available again. BFCache can re-enter in the gap. Wait only for
      // our own prior request completion, never for a foreign active owner.
      if (this.nativeCompletion) await this.nativeCompletion;
      if (generation !== this.generation) {
        this.reason = 'A reserva do timer foi cancelada.'; return false;
      }
      return new Promise<boolean>(resolve => {
        try {
          const request = this.locks!.request(LOCK_NAME, { mode: 'exclusive', ifAvailable: true }, async lock => {
            if (!lock || generation !== this.generation) {
              this.reason = generation !== this.generation
                ? 'A reserva do timer foi cancelada.'
                : 'Já existe um treino ativo em outra aba ou janela. Volte a ela ou encerre esse treino antes de continuar.';
              resolve(false); return;
            }
            const held = new Promise<void>(release => { this.releaseWeb = release; });
            this.method = 'web'; this.held = true; resolve(true);
            await held;
            if (this.generation === generation && this.method === 'web') { this.method = undefined; this.held = false; }
          });
          const completion = Promise.resolve(request).then(() => {
            if (this.nativeCompletion === completion) this.nativeCompletion = undefined;
          }, () => {
            if (this.nativeCompletion === completion) this.nativeCompletion = undefined;
            if (this.generation === generation) {
              this.method = undefined; this.held = false; this.releaseWeb = undefined;
              this.reason = 'O navegador não permitiu reservar o timer. Feche outras abas e tente novamente.';
            }
            resolve(false);
          });
          this.nativeCompletion = completion;
        } catch { this.reason = 'Não foi possível reservar o timer neste navegador.'; resolve(false); }
      });
    }
    if (!this.storage) { this.reason = 'Este navegador não oferece bloqueio entre abas nem armazenamento disponível. Use outro navegador para iniciar com segurança.'; return false; }
    try {
      const previous = this.readOwner();
      if (previous && previous.owner !== this.owner) {
        this.reason = this.now() - previous.heartbeat > this.heartbeatMs * 3
          ? 'Há uma reserva antiga do timer. Ela não é removida automaticamente porque outra aba pode estar suspensa. Feche todas as abas do timer antes de recuperar o acesso.'
          : 'Já existe um timer reservado em outra aba. Encerre-o antes de iniciar outro.';
        return false;
      }
      this.writeOwner();
      await new Promise(resolve => setTimeout(resolve, this.settleMs));
      if (generation !== this.generation || this.readOwner()?.owner !== this.owner) {
        if (this.readOwner()?.owner === this.owner) this.removeOwner();
        this.reason = 'Outra aba está reservando o timer. Tente novamente após encerrar a outra sessão.'; return false;
      }
      this.method = 'storage'; this.held = true;
      this.heartbeat = setInterval(() => {
        if (!this.owned) return;
        try { this.writeOwner(); } catch { this.lose('Não foi possível manter a reserva do timer. Confira o armazenamento do navegador.'); }
      }, this.heartbeatMs);
      // Node tests should never stay alive because of a simulated browser heartbeat.
      (this.heartbeat as unknown as { unref?: () => void }).unref?.();
      return true;
    } catch { this.reason = 'Armazenamento indisponível. Não foi possível garantir um único timer entre abas.'; return false; }
  }
  get canRecoverFallback(): boolean {
    if (this.locks?.request || !this.storage || this.held) return false;
    try {
      const raw = this.storage.getItem(WORKOUT_LOCK_KEY);
      if (!raw) return false;
      try {
        const owner = this.readOwner();
        return !!owner && owner.owner !== this.owner && (this.now() - owner.heartbeat > this.heartbeatMs * 3 || owner.heartbeat > this.now() + 60000);
      } catch { return true; } // An explicitly confirmed repair may remove a corrupt record.
    } catch { return false; }
  }
  /** Call only after explicit confirmation that all older instances were closed.
   * This never overrides a native Web Lock. A displaced fallback owner loses its
   * fence on its next `owned` check, before it may update or emit signals. */
  async recoverFallback(): Promise<boolean> {
    if (!this.canRecoverFallback) { this.reason = 'A reserva não pode ser recuperada agora. Feche o timer original e aguarde alguns segundos.'; return false; }
    try { this.removeOwner(); }
    catch { this.reason = 'Não foi possível remover a reserva antiga. Confira o armazenamento do navegador.'; return false; }
    return this.acquire();
  }
  release(): void {
    this.generation++;
    // A caller re-entering while an old request is being canceled must create
    // a fresh acquisition, fenced by nativeCompletion above.
    this.pending = undefined;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = undefined;
    if (this.method === 'storage') {
      try { if (this.readOwner()?.owner === this.owner) this.removeOwner(); } catch { /* Do not delete another tab's ownership. */ }
    }
    const release = this.releaseWeb; this.releaseWeb = undefined;
    this.method = undefined; this.held = false; release?.();
  }
  private lose(reason: string): void {
    this.reason = reason; this.held = false;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = undefined;
  }
  private readOwner(): Ownership | undefined {
    const raw = this.storage!.getItem(WORKOUT_LOCK_KEY);
    if (!raw) return undefined;
    const value = JSON.parse(raw) as Ownership;
    if (value.version !== 1 || typeof value.owner !== 'string' || !value.owner || !Number.isFinite(value.heartbeat)) throw new Error('Reserva de timer inválida.');
    return value;
  }
  private writeOwner(): void { this.storage!.setItem(WORKOUT_LOCK_KEY, JSON.stringify({ version: 1, owner: this.owner, heartbeat: this.now() })); }
  private removeOwner(): void {
    if (this.storage!.removeItem) this.storage!.removeItem(WORKOUT_LOCK_KEY);
    else this.storage!.setItem(WORKOUT_LOCK_KEY, '');
  }
}
