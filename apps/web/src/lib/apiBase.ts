/** Resolve API / WebSocket base URLs for web, PWA, and native shells. */

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export function apiBase(): string {
  const fromEnv = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (fromEnv) return trimSlash(fromEnv);

  // Capacitor / file / custom schemes can't use relative /api
  const proto = window.location.protocol;
  if (proto === 'capacitor:' || proto === 'ionic:' || proto === 'file:') {
    return 'http://localhost:3001';
  }

  // Same-origin (Vite proxy, or server hosting the built site)
  return '';
}

export function apiUrl(path: string): string {
  const base = apiBase();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}

export function wsUrl(): string {
  const fromEnv = (import.meta.env.VITE_WS_URL as string | undefined)?.trim();
  if (fromEnv) return fromEnv;

  const base = apiBase();
  if (base) {
    const u = new URL(base);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.pathname = '/ws';
    u.search = '';
    u.hash = '';
    return u.toString().replace(/\/$/, '');
  }

  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  if (import.meta.env.DEV) {
    return `${proto}//${window.location.host}/ws`;
  }
  return `${proto}//${window.location.hostname}:3001/ws`;
}
