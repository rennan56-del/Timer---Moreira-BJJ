import type { TimerSnapshot, Transition } from '../types.ts';
import type { Cue } from '../media/audio.ts';
export interface Signal { cue: Cue; key: string }
export interface SignalOptions { silent?: boolean }
/**
 * Maps actual clock thresholds to one-shot signals. It never advances the timer.
 * Keys survive pauses; silenced/hidden signals are consumed, never queued.
 */
export class SignalTracker {
  private consumed = new Set<string>();
  private readonly freshness = 750;
  reset(): void { this.consumed.clear(); }
  private prefix(snapshot: TimerSnapshot): string { return `${snapshot.phase}:${snapshot.round}`; }
  /** Skip the current/past second after restoration or a lifecycle interruption. */
  seed(snapshot: TimerSnapshot): void {
    const prefix = this.prefix(snapshot);
    this.consumed.add(`${prefix}:start`);
    const max = snapshot.phase === 'preparation' ? Math.ceil(snapshot.duration / 1000) : 3;
    for (let second = 1; second <= max; second++) {
      if (snapshot.remaining <= second * 1000) this.consumed.add(`${prefix}:second:${second}`);
    }
    if (snapshot.remaining <= 10000) this.consumed.add(`${prefix}:ten`);
  }
  update(snapshot: TimerSnapshot, transitions: Transition[], now: number, options: SignalOptions = {}): Signal[] {
    const signals: Signal[] = [];
    const emit = (cue: Cue, key: string, fresh: boolean) => {
      if (this.consumed.has(key)) return;
      this.consumed.add(key);
      if (fresh && !options.silent) signals.push({ cue, key });
    };
    // Transition identity does not contain a deadline: resuming a pause can move
    // deadlines, but can never make a round's zero signal happen twice.
    for (const event of transitions) {
      const key = `${event.from}:${event.round}:zero`;
      const current = snapshot.status === 'running' || snapshot.status === 'finished';
      emit('long', key, current && now >= event.at && now - event.at <= this.freshness);
    }
    if (snapshot.status !== 'running') return signals;
    const prefix = this.prefix(snapshot);
    const freshAt = (remaining: number) => snapshot.remaining <= remaining && remaining - snapshot.remaining <= this.freshness;
    const started = snapshot.elapsed <= this.freshness;
    const hasBoundary = transitions.length > 0;
    // Start uses a single traditional signal. A short workout beginning at 3,
    // 2 or 1 uses its mandatory countdown beep instead of an extra start tone.
    const shortStart = snapshot.duration <= 3000;
    emit('start', `${prefix}:start`, started && !hasBoundary && snapshot.phase === 'fight' && !shortStart);
    if (snapshot.phase === 'fight' && snapshot.duration > 10000 && snapshot.remaining <= 10000) {
      emit('ten', `${prefix}:ten`, freshAt(10000));
    }
    const max = snapshot.phase === 'preparation' ? Math.ceil(snapshot.duration / 1000) : 3;
    for (let second = max; second >= 1; second--) {
      const threshold = second * 1000;
      if (threshold > snapshot.duration || snapshot.remaining > threshold) continue;
      // All expired thresholds are consumed. Only a current threshold is played;
      // no cascade of old 3-2-1 beeps is emitted after a delayed/hidden period.
      emit(snapshot.phase === 'preparation' ? 'count' : 'short', `${prefix}:second:${second}`, snapshot.remaining > 0 && freshAt(threshold));
    }
    return signals;
  }
}
