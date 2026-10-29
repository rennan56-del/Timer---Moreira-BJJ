import { validateCapture } from '../core/timer.js';
import type { TimerCapture } from '../core/timer.js';
export const SESSION_KEY = 'moreira-bjj:workout:v1';
export const MAX_SESSION_AGE = 7 * 24 * 60 * 60 * 1000;
export interface SessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}
export interface SavedSession {
  version: 1;
  mode: 'moreira' | 'bjj';
  run: string;
  savedAt: number;
  capture: TimerCapture;
}
export function validateSession(value: unknown): SavedSession {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Treino salvo inválido.');
  const data = value as Record<string, unknown>;
  if (data.version !== 1 || !['moreira','bjj'].includes(String(data.mode)) || typeof data.run !== 'string' || !data.run || data.run.length > 100 || typeof data.savedAt !== 'number' || !Number.isFinite(data.savedAt) || data.savedAt < 0) throw new Error('Dados do treino salvo inválidos.');
  return { version: 1, mode: data.mode as SavedSession['mode'], run: data.run, savedAt: data.savedAt, capture: validateCapture(data.capture) };
}
export function saveSession(storage: SessionStorage, session: SavedSession): void {
  storage.setItem(SESSION_KEY, JSON.stringify(validateSession(session)));
}
export function loadSession(storage: SessionStorage, now = Date.now()): { session?: SavedSession; elapsedMs?: number; warning?: string } {
  try {
    const raw = storage.getItem(SESSION_KEY);
    if (!raw) return {};
    if (raw.length > 10000) throw new Error('Treino salvo excede o tamanho permitido.');
    const session = validateSession(JSON.parse(raw));
    if (!Number.isFinite(now) || session.savedAt > now + 60000) throw new Error('A data do treino salvo está no futuro. Confira o relógio do dispositivo.');
    const elapsedMs = Math.max(0, now - session.savedAt);
    if (elapsedMs > MAX_SESSION_AGE) throw new Error('O treino salvo tem mais de sete dias. Inicie um novo treino.');
    return { session, elapsedMs: session.capture.status === 'running' ? elapsedMs : 0 };
  } catch (error) {
    return { warning: error instanceof Error ? error.message : 'Não foi possível recuperar o treino salvo.' };
  }
}
export function clearSession(storage: SessionStorage): void {
  if (storage.removeItem) storage.removeItem(SESSION_KEY);
  else storage.setItem(SESSION_KEY, '');
}
