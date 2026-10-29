import { isProtocol, protocolTraining, protocolDuration } from './protocols.js';
import type { ProtocolId } from './protocols.ts';
import type { Training, Phase, Status, TimerSnapshot, Transition } from '../types.ts';
export function validateTraining(config: Training): Training {
  for (const [key, max, min] of [['fight', 86400, 1], ['rest', 86400, 0], ['rounds', 999, 1], ['preparation', 60, 0]] as const) {
    if (!Number.isInteger(config[key]) || config[key] < min || config[key] > max) throw new Error(`Valor inválido: ${key}`);
  }
  return { ...config };
}
export interface TimerCapture {
  version: 1;
  training: Training;
  protocol?: ProtocolId;
  status: Status;
  phase: Phase;
  round: number;
  /** May be negative when a delayed callback has not reconciled the phase yet. */
  remaining: number;
  revision: number;
}
/** Strict validation keeps corrupted persisted data out of the timer engine. */
export function validateCapture(value: unknown): TimerCapture {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Treino salvo inválido.');
  const data = value as Record<string, unknown>;
  if (data.version !== 1 || !data.training || typeof data.training !== 'object' || Array.isArray(data.training)) throw new Error('Versão de treino salvo inválida.');
  const raw = data.training as Record<string, unknown>;
  const training = validateTraining({ fight: raw.fight as number, rest: raw.rest as number, rounds: raw.rounds as number, preparation: raw.preparation as number });
  const protocol = data.protocol;
  if (protocol !== undefined) {
    if (!isProtocol(protocol)) throw new Error('Protocolo salvo inválido.');
    const expected = protocolTraining(protocol);
    if (Object.keys(expected).some(key => training[key as keyof Training] !== expected[key as keyof Training])) throw new Error('Durações do protocolo salvo inválidas.');
  }
  if (!['idle','running','paused','finished','ended'].includes(String(data.status)) || !['preparation','fight','rest'].includes(String(data.phase))) throw new Error('Etapa do treino salvo inválida.');
  const status = data.status as Status, phase = data.phase as Phase;
  const round = data.round as number, remaining = data.remaining as number, revision = data.revision as number;
  if (!Number.isInteger(round) || round < 1 || round > training.rounds || !Number.isSafeInteger(revision) || revision < 0 || typeof remaining !== 'number' || !Number.isFinite(remaining)) throw new Error('Valores do treino salvo inválidos.');
  if (remaining > (protocol ? protocolDuration(protocol as ProtocolId,phase,round) : training[phase]) * 1000 || (status !== 'running' && remaining < 0)) throw new Error('Tempo do treino salvo inválido.');
  if (phase === 'preparation' && (round !== 1 || training.preparation === 0) || phase === 'rest' && (round === training.rounds || (protocol ? protocolDuration(protocol as ProtocolId,'rest',round) : training.rest) === 0)) throw new Error('Sequência do treino salvo inválida.');
  if (status === 'idle' && (phase !== 'fight' || round !== 1 || remaining !== training.fight * 1000)) throw new Error('Treino inicial salvo inválido.');
  if (status === 'finished' && (phase !== 'fight' || round !== training.rounds || remaining !== 0) || status === 'ended' && remaining !== 0) throw new Error('Encerramento do treino salvo inválido.');
  return { version: 1, training, status, phase, round, remaining, revision, ...(protocol ? {protocol:protocol as ProtocolId} : {}) };
}
export class TimerEngine {
  private config: Training;
  private protocol?: ProtocolId;
  get protocolId(): ProtocolId | undefined { return this.protocol; }
  configureProtocol(id: ProtocolId): void {
    const training = protocolTraining(id);
    this.configure(training); this.protocol = id; this.reset();
  }
  private status: Status = 'idle';
  private phase: Phase = 'fight';
  private round = 1;
  private deadline = 0;
  private frozen = 0;
  private revision = 0;
  constructor(config: Training, private now: () => number = () => performance.now()) {
    this.config = validateTraining(config);
    this.frozen = config.fight * 1000;
  }
  configure(config: Training): void {
    if (this.status === 'running' || this.status === 'paused') throw new Error('Encerre o treino antes de alterar os tempos.');
    this.config = validateTraining(config); this.protocol = undefined;
    this.reset();
  }
  start(): void {
    if (this.status === 'running' || this.status === 'paused') return;
    this.round = 1;
    this.phase = this.config.preparation > 0 ? 'preparation' : 'fight';
    this.status = 'running';
    this.deadline = this.now() + this.duration();
    this.revision++;
  }
  private duration(): number { return (this.protocol ? protocolDuration(this.protocol,this.phase,this.round) : this.config[this.phase]) * 1000; }
  tick(): Transition[] {
    const transitions: Transition[] = [];
    if (this.status !== 'running') return transitions;
    const current = this.now();
    // Deadlines advance from the previous deadline, never from a delayed callback.
    while (this.status === 'running' && current >= this.deadline) {
      const from = this.phase, at = this.deadline, round = this.round;
      if (from === 'preparation') this.phase = 'fight';
      else if (from === 'fight' && this.round === this.config.rounds) {
        this.status = 'finished'; this.frozen = 0;
      } else if (from === 'fight' && (this.protocol ? protocolDuration(this.protocol,'rest',this.round) : this.config.rest) > 0) this.phase = 'rest';
      else { this.phase = 'fight'; this.round++; }
      this.revision++;
      transitions.push({ from, to: this.status === 'finished' ? 'finished' : this.phase, round, at });
      if (this.status === 'running') this.deadline += this.duration();
    }
    return transitions;
  }
  pause(): Transition[] {
    const events = this.tick();
    if (this.status === 'running') { this.frozen = Math.max(0, this.deadline - this.now()); this.status = 'paused'; }
    return events;
  }
  resume(): void {
    if (this.status !== 'paused') return;
    this.deadline = this.now() + this.frozen;
    this.status = 'running';
  }
  reset(): void {
    this.status = 'idle'; this.phase = 'fight'; this.round = 1;
    this.frozen = this.config.fight * 1000; this.revision++;
  }
  end(): void { this.tick(); this.status = 'ended'; this.frozen = 0; this.revision++; }
  advance(): Transition[] {
    const events = this.tick();
    if (this.status !== 'running' && this.status !== 'paused') return events;
    const wasPaused = this.status === 'paused';
    if (wasPaused) this.status = 'running';
    this.deadline = this.now();
    events.push(...this.tick());
    if (wasPaused && this.status === 'running') this.pause();
    return events;
  }
  /** Capture never consumes transitions, so saving cannot swallow a boundary bell. */
  capture(): TimerCapture {
    return { version: 1, training: { ...this.config }, status: this.status, phase: this.phase,
      round: this.round, remaining: this.status === 'running' ? this.deadline - this.now() : this.frozen,
      revision: this.revision, ...(this.protocol ? {protocol:this.protocol} : {}) };
  }
  /** Restoration advances expired phases silently; callers seed their signal tracker. */
  restore(value: unknown, elapsedMs = 0): void {
    const data = validateCapture(value);
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > Number.MAX_SAFE_INTEGER) throw new Error('Tempo de recuperação inválido.');
    this.config = data.training; this.protocol = data.protocol; this.status = data.status; this.phase = data.phase;
    this.round = data.round; this.revision = data.revision; this.frozen = Math.max(0, data.remaining);
    this.deadline = this.now() + data.remaining - (data.status === 'running' ? elapsedMs : 0);
    this.tick();
  }
  snapshot(): TimerSnapshot {
    const remaining = this.status === 'running' ? Math.max(0, this.deadline - this.now()) : this.frozen;
    const duration = this.duration();
    return { status: this.status, phase: this.phase, round: this.round, rounds: this.config.rounds,
      remaining, duration, elapsed: Math.max(0, duration - remaining), revision: this.revision };
  }
}
export function formatTime(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
