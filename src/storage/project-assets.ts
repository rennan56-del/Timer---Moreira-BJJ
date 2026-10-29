import type { Photo } from '../types.ts';

export interface ProjectAssets { photos: Photo[]; logoURL?: string }
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function localAsset(value: unknown, directory: 'athletes' | 'branding', base: URL): URL | undefined {
  if (typeof value !== 'string' || !value.startsWith(`images/${directory}/`)) return undefined;
  try {
    const url = new URL(value, base);
    if (url.origin !== base.origin || !url.pathname.startsWith(`${base.pathname}images/${directory}/`) || url.search || url.hash) return undefined;
    const path = decodeURIComponent(url.pathname);
    if (path.includes('\\') || path.includes('/../') || path.includes('/./')) return undefined;
    if (directory === 'athletes' && !/\.(?:jpe?g|png|webp|avif)$/i.test(path)) return undefined;
    if (directory === 'branding' && !/\/logo\.(?:jpe?g|png|webp|svg)$/i.test(path)) return undefined;
    return url;
  } catch { return undefined; }
}

/** Public, authorized project assets. User imports remain separate in IndexedDB. */
export async function loadProjectAssets(
  baseURI: string = typeof document === 'undefined' ? '' : document.baseURI,
  request: Fetcher = (input, init) => fetch(input, init)
): Promise<ProjectAssets> {
  let base: URL;
  try { base = new URL('./', baseURI); } catch { return { photos: [] }; }
  if (!['http:', 'https:'].includes(base.protocol)) return { photos: [] };
  const catalog = async (directory: string): Promise<Record<string, unknown> | undefined> => {
    try {
      const response = await request(new URL(`images/${directory}/catalog.json`, base));
      if (!response.ok) return undefined;
      const value: unknown = await response.json();
      if (!value || typeof value !== 'object' || Array.isArray(value) || (value as Record<string, unknown>).version !== 1) return undefined;
      return value as Record<string, unknown>;
    } catch { return undefined; }
  };
  const [athletes, branding] = await Promise.all([catalog('athletes'), catalog('branding')]);
  const ids = new Set<string>();
  const entries = Array.isArray(athletes?.photos) ? athletes.photos.slice(0, 200) : [];
  const loaded = await Promise.all(entries.map(async (value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const item = value as Record<string, unknown>;
    if (typeof item.id !== 'string' || !/^project-athlete-[a-z0-9-]{1,80}$/i.test(item.id) || ids.has(item.id)) return undefined;
    const url = localAsset(item.url, 'athletes', base);
    if (!url) return undefined;
    ids.add(item.id);
    try {
      const response = await request(url);
      if (!response.ok) return undefined;
      let blob = await response.blob();
      if (!blob.size || blob.size > 20 * 1024 * 1024) return undefined;
      // Some simple hosts use application/octet-stream for WebP/AVIF files.
      if (!blob.type.startsWith('image/')) {
        const extension = url.pathname.split('.').at(-1)?.toLowerCase();
        blob = new Blob([blob], { type: extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : `image/${extension}` });
      }
      return { id: item.id, name: typeof item.name === 'string' ? item.name.slice(0, 120) : 'Foto da academia',
        blob, enabled: true, createdAt: 0 } as Photo;
    } catch { return undefined; }
  }));
  const logo = localAsset(branding?.logoURL, 'branding', base);
  return { photos: loaded.filter((photo): photo is Photo => !!photo), ...(logo ? { logoURL: logo.href } : {}) };
}
