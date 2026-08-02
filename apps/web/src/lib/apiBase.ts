/** Resolve API / WebSocket base URLs for web, PWA, and native shells. */

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function isNativeShell(): boolean {
  const proto = window.location.protocol;
  return proto === 'capacitor:' || proto === 'ionic:' || proto === 'file:';
}

function isBrowserDeploy(): boolean {
  return window.location.protocol === 'http:' || window.location.protocol === 'https:';
}

export function apiBase(): string {
  // Website / PWA deploy: always same-origin (Express serves API + UI together).
  // Never use VITE_API_URL here — local Capacitor emulator envs must not break production.
  if (isBrowserDeploy() && !isNativeShell()) {
    return '';
  }

  const fromEnv = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (fromEnv) return trimSlash(fromEnv);

  if (isNativeShell()) {
    return 'http://10.0.2.2:3001';
  }

  return '';
}

export function apiUrl(path: string): string {
  const base = apiBase();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}

export function wsUrl(): string {
  // Website / PWA: same host as the page (wss on https).
  if (isBrowserDeploy() && !isNativeShell()) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws`;
  }

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
  return `${proto}//${window.location.host}/ws`;
}
