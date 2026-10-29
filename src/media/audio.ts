import type { Settings } from '../types.ts';
export type Cue = 'start' | 'end' | 'count' | 'ten' | 'return' | 'funny' | 'short' | 'long' | 'test-short' | 'test-long';
type AudioOptions = Settings['audio'] & { musicCompatibility?: boolean };
export const SIGNAL_PEAK_BUDGET = .9;
interface Voice { priority: number; peak: number }
/** Oscillators only: no media elements, Media Session, focus requests or keepalive. */
export class AudioSystem {
  private context?: AudioContext;
  private nodes = new Map<OscillatorNode, Voice>();
  private master?: GainNode;
  private buzzerWave?: PeriodicWave;
  private importantUntil = 0;
  private error = '';
  private enabling?: Promise<boolean>;
  get ready(): boolean { return this.context?.state === 'running'; }
  get state(): string { return this.context?.state || 'not-initialized'; }
  get lastError(): string { return this.error; }
  async enable(): Promise<boolean> {
    if (this.enabling) return this.enabling;
    this.enabling = this.activate();
    try { return await this.enabling; }
    finally { this.enabling = undefined; }
  }
  /** Call only from a user interaction. It never changes the timer or round. */
  recover(): Promise<boolean> {
    // Discard tones frozen in a suspended context instead of finishing old beeps
    // when the user restores the output route. This does not touch timer state.
    this.stop();
    return this.enable();
  }
  private async activate(): Promise<boolean> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const Constructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Constructor) { this.error = 'Web Audio não está disponível neste navegador.'; return false; }
      if (!this.context || this.context.state === 'closed') {
        this.stop();
        this.master?.disconnect();
        this.master = undefined;
        this.buzzerWave = undefined;
        this.context = new Constructor({ latencyHint: 'interactive' });
      }
      if (!this.master) {
        this.master = this.context.createGain();
        this.master.gain.setValueAtTime(1, this.context.currentTime);
        this.master.connect(this.context.destination);
      }
      if (!this.ready) {
        // A browser may leave resume pending when no usable output is available.
        // The UI must recover rather than hang indefinitely; late success is
        // reflected by the ready/state getters without replaying previous cues.
        await Promise.race([
          this.context.resume(),
          new Promise<void>(resolve => { timeout = setTimeout(resolve, 1500); })
        ]);
      }
      this.error = this.ready ? '' : 'Áudio suspenso pelo navegador. Toque em Reativar áudio e confira a saída do dispositivo.';
      return this.ready;
    } catch {
      this.error = 'Não foi possível ativar o áudio. Confira permissões, modo silencioso e a saída de som.';
      return false;
    } finally { if (timeout !== undefined) clearTimeout(timeout); }
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
      this.error = 'A saída de áudio falhou. Toque em Reativar áudio; o treino continua.';
      return false;
    }
  }
}
