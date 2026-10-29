import type { Settings } from '../types.ts';
import { saveSettings } from './settings.js';
import type { KeyStorage } from './settings.js';
export const AUDIO_UPGRADE_KEY = 'moreira-bjj:piercing-audio:v1';
/** Upgrade existing quiet presets once; never unmute or overwrite future choices. */
export function upgradeAudio(settings: Settings, storage: KeyStorage): Settings {
  try { if (storage.getItem(AUDIO_UPGRADE_KEY) === '1') return settings; } catch { /* Keep the timer usable when storage is denied. */ }
  const next = structuredClone(settings);
  if (next.audio.enabled && next.audio.volume > 0) next.audio.volume = 100;
  try { saveSettings(storage,next); storage.setItem(AUDIO_UPGRADE_KEY,'1'); } catch { /* In-memory strong preset still works. */ }
  return next;
}
