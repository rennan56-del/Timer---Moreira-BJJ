import type { Photo, Phrase, Settings } from '../types.ts';
import { pickNext } from '../core/random.js';
export class RestPlaylist {
  private previousPhoto?: string;
  private previousPhrase?: string;
  private entries: { photo?: Photo; phrase?: Phrase }[] = [];
  private token = '';
  reset(): void { this.token = ''; this.entries = []; }
  frame(token: string, elapsed: number, settings: Settings, photos: Photo[]): { photo?: Photo; phrase?: Phrase } | undefined {
    if (settings.humor.mode === 'serious') return undefined;
    if (token !== this.token) {
      this.token = token;
      let previousPhoto = this.previousPhoto, previousPhrase = this.previousPhrase;
      this.entries = Array.from({ length: Math.floor(settings.humor.photosPerRest) }, () => {
        const photo = pickNext(photos, previousPhoto);
        const phrase = pickNext(settings.phrases, previousPhrase);
        previousPhoto = photo?.id; previousPhrase = phrase?.id;
        return { photo, phrase };
      });
    }
    const slot = Math.floor(elapsed / (settings.humor.photoDuration * 1000));
    if (settings.humor.display === 'start' && slot >= this.entries.length) return undefined;
    // The last frame remains for the rest of the interval; no cyclic duplicate.
    const entry = this.entries[Math.min(slot, this.entries.length - 1)];
    this.previousPhoto = entry?.photo?.id; this.previousPhrase = entry?.phrase?.id;
    return { photo: entry?.photo, phrase: settings.humor.phrases ? entry?.phrase : undefined };
  }
}
