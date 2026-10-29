/** Uniform choice excluding the previous item whenever at least two are enabled. */
export function pickNext<T extends { id: string; enabled: boolean }>(items: T[], previous?: string, random = Math.random): T | undefined {
  const enabled = items.filter(item => item.enabled);
  const pool = enabled.length > 1 ? enabled.filter(item => item.id !== previous) : enabled;
  return pool.length ? pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] : undefined;
}
