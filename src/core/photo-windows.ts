import type { TimerSnapshot } from '../types.ts';
export type PhotoMoment = 'start' | 'end' | 'final';
/** Photos accompany only the first/last three real seconds, never drive time. */
export function photoMoment(snapshot: TimerSnapshot, mode: 'moreira' | 'bjj' | null): PhotoMoment | undefined {
  if (mode !== 'bjj') return undefined;
  if (snapshot.status === 'finished') return 'final';
  if (snapshot.status !== 'running' && snapshot.status !== 'paused') return undefined;
  // In phases <=6s the windows may overlap; the end window takes precedence.
  if (snapshot.remaining > 0 && snapshot.remaining <= 3000) return 'end';
  if (snapshot.elapsed < 3000) return 'start';
  return undefined;
}
