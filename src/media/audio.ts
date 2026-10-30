import type { Settings } from '../types.ts';
export type Cue = 'start' | 'end' | 'count' | 'ten' | 'return' | 'funny' | 'short' | 'long' | 'test-short' | 'test-long';
type AudioOptions = Settings['audio'] & { musicCompatibility?: boolean };
export const SIGNAL_PEAK_BUDGET = .9;
interface Voice { priority: number; peak: number }
/** A moving clock verifies processing, not acoustic output or the AirPlay route. */
export async function audioClockAdvances(context: AudioContext): Promise<boolean> {
  if (String(context.state) !== 'running') return false;
  const before = context.currentTime;
  await new Promise<void>(resolve => setTimeout(resolve,100));
  return String(context.state) === 'running' && context.currentTime - before > .001;
}
/** Oscillators only: no media elements, Media Session, focus requests or keepalive. */
export class AudioSystem {
  private context?: AudioContext;
  private nodes = new Map<OscillatorNode, Voice>();
  private master?: GainNode;
  private buzzerWave?: PeriodicWave;
  private importantUntil = 0;
  private error = '';
  private epoch = 0;
  private dirty = false;
  private tapRequired = false;
  private repairing = false;
  private pending?: { token: number; promise: Promise<boolean> };
  onChange?: () => void;
  constructor(private probe: (context: AudioContext) => Promise<boolean> = audioClockAdvances) {}
  get ready(): boolean { return this.state === 'running' && !this.dirty && !this.repairing; }
  get state(): string { return this.context ? String(this.context.state) : 'not-initialized'; }
  get lastError(): string { return this.error; }
  get needsRecovery(): boolean { return this.dirty; }
  get needsGesture(): boolean { return this.tapRequired; }
  get recovering(): boolean { return this.repairing || !!this.pending; }
  enable(): Promise<boolean> {
    if (this.dirty || this.tapRequired) return this.recover();
    return this.pending?.promise || this.launch(false,false,false);
  }
  /** Fence late work and discard frozen tones when the page/output is interrupted. */
  markInterrupted(): void {
    this.epoch++; this.pending = undefined; this.repairing = false;
    this.dirty = true; this.tapRequired = false; this.stop(); this.onChange?.();
  }
  /** Automatic return repairs once; a real user gesture may preempt blocked work. */
  recover(options: { automatic?: boolean } = {}): Promise<boolean> {
    const automatic = options.automatic === true;
    if (automatic && this.pending) return this.pending.promise;
    // A single tap rebuilds a failed or apparently-running output synchronously,
    // so context creation/resume still happen inside the browser's activation.
    const rebuild = !automatic && (this.tapRequired || this.state === 'running');
    return this.launch(true,automatic,rebuild);
  }
  private launch(repair: boolean, automatic: boolean, rebuild: boolean): Promise<boolean> {
    const token = ++this.epoch;
    this.repairing = repair; this.tapRequired = false;
    if (repair) { this.dirty = true; this.stop(); }
    const promise = this.activate(token,repair,automatic,rebuild).finally(() => {
      if (token !== this.epoch) return;
      this.pending = undefined; this.repairing = false; this.onChange?.();
    });
    this.pending = {token,promise};
    return promise;
  }
  private async bounded(action: () => Promise<unknown>): Promise<boolean> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        action().then(() => true, () => false),
        new Promise<boolean>(resolve => { timeout = setTimeout(() => resolve(false),1500); })
      ]);
    } catch { return false; }
    finally { clearTimeout(timeout); }
  }
  private createContext(): AudioContext {
    const Constructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Constructor) throw new Error('Web Audio indisponível');
    const previous = this.context;
    // Preserve an explicit sink only where the browser exposes one. iOS/AirPlay
    // routing is OS-controlled; no route picker, focus API or setSinkId is used.
    const sinkId = (previous as AudioContext & {sinkId?: string} | undefined)?.sinkId;
    this.stop(); this.master?.disconnect(); this.master = undefined; this.buzzerWave = undefined;
    this.context = undefined;
    if (previous) {
      previous.onstatechange = null;
      try { void previous.close().catch(() => {}); } catch { /* Already closed. */ }
    }
    const context = new Constructor({latencyHint:'interactive', ...(typeof sinkId === 'string' ? {sinkId} : {})});
    this.context = context;
    context.onstatechange = () => {
      if (context !== this.context) return;
      if (String(context.state) !== 'running') { this.dirty = true; this.stop(); }
      this.onChange?.();
    };
    return context;
  }
  private graph(context: AudioContext): void {
    if (this.master) return;
    const master = context.createGain();
    master.gain.setValueAtTime(1,context.currentTime); master.connect(context.destination); this.master = master;
  }
  private async resume(context: AudioContext, cycle: boolean, verify: boolean): Promise<boolean> {
    const resumed = await this.bounded(() => {
      if (cycle && typeof context.suspend === 'function') {
        // Queue both operations inside the gesture; no await before resume.
        const suspended = context.suspend(), running = context.resume();
        return Promise.all([suspended,running]);
      }
      return context.resume();
    });
    if (!resumed || String(context.state) !== 'running') return false;
    if (!verify) return true;
    let healthy = false;
    return await this.bounded(async () => { healthy = await this.probe(context); }) && healthy;
  }
  private async activate(token: number, repair: boolean, automatic: boolean, rebuild: boolean): Promise<boolean> {
    try {
      let context = rebuild || !this.context || this.state === 'closed' ? this.createContext() : this.context;
      this.graph(context);
      let good = !repair && String(context.state) === 'running' ? true : await this.resume(context,repair && automatic && String(context.state) === 'running',repair);
      if (token !== this.epoch) return false;
      if (!good && repair && !rebuild) {
        context = this.createContext(); this.graph(context);
        good = await this.resume(context,false,true);
        if (token !== this.epoch) return false;
      }
      this.dirty = !good; this.tapRequired = !good;
      this.error = good ? '' : 'Áudio bloqueado ou interrompido. Toque em Reativar áudio; o treino continua.';
      return good;
    } catch (error) {
      if (token !== this.epoch) return false;
      this.dirty = true; this.tapRequired = true;
      this.error = error instanceof Error && error.message === 'Web Audio indisponível' ? 'Web Audio não está disponível neste navegador.' : 'Não foi possível ativar o áudio. Confira permissões, modo silencioso e a saída de som.';
      return false;
    }
  }
  stop(): void {
    for (const node of this.nodes.keys()) { try { node.stop(); } catch { /* Already stopped. */ } }
    this.nodes.clear(); this.importantUntil = 0; this.balanceVoices();
  }
  private stopAdvisories(): void {
    for (const [node, voice] of this.nodes) {
      if (voice.priority < 2) { try { node.stop(); } catch { /* Already stopped. */ } this.nodes.delete(node); }
    }
    this.balanceVoices();
  }
  /** A shared gain bounds even rapid/coincident cues without clipping or dropping a beep. */
  private balanceVoices(): void {
    if (!this.context || !this.master) return;
    const peak = [...this.nodes.values()].reduce((sum, voice) => sum + voice.peak, 0);
    try { this.master.gain.setValueAtTime(peak > SIGNAL_PEAK_BUDGET ? SIGNAL_PEAK_BUDGET / peak : 1, this.context.currentTime); }
    catch { /* The system may close the output while a voice is ending. */ }
  }
  play(cue: Cue, settings: AudioOptions): boolean {
    if (!this.ready || !settings.enabled || !Number.isFinite(settings.volume) || settings.volume <= 0 || !this.context || !this.master) return false;
    // Mandatory short/long signals can only be silenced by mute/volume. Older
    // optional controls remain supported for preparation/advisory/funny sounds.
    if ((cue === 'start' || cue === 'end') && !settings.sirens) return false;
    if (cue === 'count' && !settings.countdown || cue === 'ten' && !settings.lastTen || cue === 'return' && !settings.returnCue || cue === 'funny' && !settings.funny) return false;
    const ctx = this.context, now = ctx.currentTime;
    const music = settings.musicCompatibility !== false;
    // UI presets use 65 for Normal and 100 for Academia. Existing custom
    // volumes remain valid; high values select the stronger gym envelope.
    const gym = settings.volume >= 85;
    const isShort = cue === 'short' || cue === 'test-short';
    const isLong = cue === 'long' || cue === 'test-long' || cue === 'end';
    const mandatory = isShort || isLong || cue === 'start' || cue === 'count' || cue === 'return';
    if (!mandatory && now < this.importantUntil) return false;
    const priority = mandatory ? (isLong ? 3 : 2) : cue === 'funny' ? 0 : 1;
    if (mandatory) this.stopAdvisories();
    // Music mode changes optional effects, never attenuates mandatory signals.
    const volume = Math.min(100, settings.volume) / 100 * (gym ? .88 : .78);
    const tone = (frequency: number, start: number, length: number, end = frequency, type: OscillatorType = 'sine') => {
      const oscillator = ctx.createOscillator(), gain = ctx.createGain();
      if (type === 'square' && typeof ctx.createPeriodicWave === 'function' && typeof oscillator.setPeriodicWave === 'function') {
        // Original band-limited buzzer: stronger odd harmonics than a triangle.
        // Browser normalization bounds the waveform itself to a unit peak,
        // while the shared master bounds all simultaneous voice amplitudes.
        if (!this.buzzerWave) {
          const real = new Float32Array(8), imaginary = new Float32Array(8);
          for (const harmonic of [1, 3, 5, 7]) imaginary[harmonic] = 1 / harmonic;
          this.buzzerWave = ctx.createPeriodicWave(real, imaginary, { disableNormalization: false });
        }
        oscillator.setPeriodicWave(this.buzzerWave);
      } else oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(30,end), start + length);
      const attack = gym ? .002 : .003;
      const release = Math.min(.020, length * .07);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume, start + attack);
      gain.gain.setValueAtTime(volume, start + length - release);
      gain.gain.linearRampToValueAtTime(.0001, start + length);
      oscillator.connect(gain); gain.connect(this.master!);
      this.nodes.set(oscillator, { priority, peak: volume });
      this.balanceVoices();
      oscillator.onended = () => { this.nodes.delete(oscillator); oscillator.disconnect(); gain.disconnect(); this.balanceVoices(); };
      oscillator.start(start); oscillator.stop(start + length + .015);
      if (priority > 0) this.importantUntil = Math.max(this.importantUntil, start + length + .02);
    };
    try {
      // At very short phase boundaries, a new phase's initial short beep can
      // coincide with the prior zero. Different frequencies remain mixed; the
      // required short never cuts the long signal or introduces timer delay.
      if (isShort) tone(gym ? 2400 : 2000, now, gym ? .23 : .18, gym ? 2400 : 2000, 'square');
      else if (isLong) tone(gym ? 1080 : 960, now, gym ? 1.05 : .90, gym ? 1080 : 960, 'square');
      else if (cue === 'start') tone(gym ? 880 : 740, now, gym ? .30 : .26, gym ? 1040 : 880, 'triangle');
      else if (cue === 'ten') { tone(800,now,.075); tone(800,now+.15,.075); }
      else if (cue === 'return') tone(gym ? 2400 : 2000, now, gym ? .23 : .18, gym ? 2400 : 2000, 'square');
      else if (cue === 'funny') {
        // Music compatibility disables nonessential longer comic effects.
        if (music) return false;
        tone(180,now,.18,620,'triangle'); tone(520,now+.20,.22,120,'triangle');
      } else tone(gym ? 2400 : 2000, now, gym ? .23 : .18, gym ? 2400 : 2000, 'square');
      return true;
    } catch {
      this.dirty = true; this.tapRequired = false;
      this.error = 'A saída de áudio falhou. Toque em Reativar áudio; o treino continua.';
      this.onChange?.();
      return false;
    }
  }
}
