const paths: Record<string,string> = {
  play: '<path d="m9 5 12 7-12 7z"/>', pause: '<path d="M8 5v14M16 5v14"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  next: '<path d="m5 5 10 7-10 7zM19 5v14"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  settings: '<path d="m10 3-.7 3-2 .9-2.7-1L2.8 9l2.1 2v2l-2.1 2 1.8 3.1 2.7-1 2 .9.7 3h4l.7-3 2-.9 2.7 1 1.8-3.1-2.1-2v-2l2.1-2-1.8-3.1-2.7 1-2-.9L14 3z"/><circle cx="12" cy="12" r="3"/>',
  tv: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',
  fullscreen: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  sound: '<path d="M11 4 6 8H3v8h3l5 4zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="M11 4 6 8H3v8h3l5 4zM16 9l6 6m0-6-6 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  photo: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  check: '<path d="m5 12 4 4L19 6"/>', trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  shield: '<path d="m12 3 9 3v6c0 5-9 9-9 9s-9-4-9-9V6z"/><path d="m8 12 3 3 5-6"/>',
};
export function icon(name: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.play}</svg>`;
}
export const escapeHTML = (text: string): string => text.replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]!);
