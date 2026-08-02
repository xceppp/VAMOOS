const KEY = 'vamoos:favorites';
const LEGACY_KEYS = ['hirbel:favorites', 'tg3d:favorites'];

function read(): number[] {
  try {
    let raw = localStorage.getItem(KEY);
    if (!raw) {
      for (const k of LEGACY_KEYS) {
        raw = localStorage.getItem(k);
        if (raw) break;
      }
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const ids = parsed.filter((id): id is number => typeof id === 'number');
    if (!localStorage.getItem(KEY) && ids.length) write(ids);
    return ids;
  } catch {
    return [];
  }
}

function write(ids: number[]) {
  localStorage.setItem(KEY, JSON.stringify(ids));
}

export function getFavorites(): number[] {
  return read();
}

export function isFavorite(id: number): boolean {
  return read().includes(id);
}

export function toggleFavorite(id: number): number[] {
  const current = read();
  const next = current.includes(id)
    ? current.filter((x) => x !== id)
    : [...current, id];
  write(next);
  return next;
}

export function subscribeFavorites(listener: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || (e.key != null && LEGACY_KEYS.includes(e.key))) listener();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener('vamoos:favorites', listener);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('vamoos:favorites', listener);
  };
}

export function notifyFavoritesChanged() {
  window.dispatchEvent(new Event('vamoos:favorites'));
}
