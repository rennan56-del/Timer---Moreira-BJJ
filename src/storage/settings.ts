import type { Settings, Phrase } from '../types.ts';
import { initialPhrases } from './phrases.js';
import { validateTraining } from '../core/timer.js';
export const SETTINGS_KEY = 'moreira-bjj:settings:v1';
export const defaults = (): Settings => ({
  version: 1, training: { fight: 300, rest: 60, rounds: 5, preparation: 3 },
  appearance: { fight: '#a8ff1a', rest: '#ff343b', preparation: '#f5ff18', scale: 100, animations: true },
  humor: { mode: 'resenha', photoDuration: 5, photosPerRest: 3, display: 'throughout', phrases: true, animations: true },
  audio: { enabled: true, volume: 100, musicCompatibility: true, sirens: true, countdown: true, lastTen: true, returnCue: true, funny: false },
  phrases: initialPhrases()
});
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Estrutura de configurações inválida.');
  return value as Record<string, unknown>;
}
function number(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error('Número de configuração inválido.');
  return value;
}
function boolean(value: unknown): boolean { if (typeof value !== 'boolean') throw new Error('Opção de configuração inválida.'); return value; }
export function validateSettings(value: unknown): Settings {
  const s = record(value);
  if (s.version !== 1) throw new Error('Versão de configurações não suportada.');
  const t = record(s.training), a = record(s.appearance), h = record(s.humor), u = record(s.audio);
  const color = (v: unknown): string => { if (typeof v !== 'string' || !/^#[0-9a-f]{6}$/i.test(v)) throw new Error('Cor inválida.'); return v; };
  if (!['serious','resenha','chaos'].includes(String(h.mode)) || !['start','throughout'].includes(String(h.display))) throw new Error('Modo inválido.');
  if (!Array.isArray(s.phrases) || s.phrases.length > 2000) throw new Error('Biblioteca de frases inválida (máximo 2.000).');
  const ids = new Set<string>();
  const phrases: Phrase[] = s.phrases.map(value => {
    const p = record(value);
    if (typeof p.id !== 'string' || !p.id || p.id.length > 100 || ids.has(p.id) || typeof p.text !== 'string' || !p.text.trim() || p.text.length > 180) throw new Error('Frase inválida ou duplicada.');
    ids.add(p.id); return { id: p.id, text: p.text.trim(), enabled: boolean(p.enabled) };
  });
  return {
    version: 1,
    training: validateTraining({ fight: t.fight as number, rest: t.rest as number, rounds: t.rounds as number, preparation: t.preparation as number }),
    appearance: { fight: color(a.fight), rest: color(a.rest), preparation: color(a.preparation), scale: number(a.scale, 70, 125), animations: boolean(a.animations) },
    humor: { mode: h.mode as Settings['humor']['mode'], display: h.display as Settings['humor']['display'], photoDuration: number(h.photoDuration, 1, 60), photosPerRest: number(h.photosPerRest, 1, 30), phrases: boolean(h.phrases), animations: boolean(h.animations) },
    audio: { enabled: boolean(u.enabled), volume: number(u.volume, 0, 100), musicCompatibility: u.musicCompatibility === undefined ? true : boolean(u.musicCompatibility), sirens: boolean(u.sirens), countdown: boolean(u.countdown), lastTen: boolean(u.lastTen), returnCue: boolean(u.returnCue), funny: boolean(u.funny) },
    phrases
  };
}
export interface KeyStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function loadSettings(storage: KeyStorage): { settings: Settings; warning?: string } {
  try { const raw = storage.getItem(SETTINGS_KEY); return { settings: raw ? validateSettings(JSON.parse(raw)) : defaults() }; }
  catch { return { settings: defaults(), warning: 'Não foi possível ler as configurações salvas. Usando os padrões.' }; }
}
export function saveSettings(storage: KeyStorage, settings: Settings): void {
  storage.setItem(SETTINGS_KEY, JSON.stringify(validateSettings(settings)));
}
