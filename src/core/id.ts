interface IdSource { randomUUID?(): string; getRandomValues?(values: Uint32Array): Uint32Array }
/** Local record IDs only, never credentials. Also works on HTTP LAN previews. */
export function createId(source: IdSource | undefined = globalThis.crypto): string {
  if (source?.randomUUID) return source.randomUUID();
  if (source?.getRandomValues) {
    const values = source.getRandomValues(new Uint32Array(4));
    return Array.from(values, value => value.toString(16).padStart(8,'0')).join('-');
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
