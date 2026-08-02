export type NotifyEventKey = 'goal' | 'kickoff' | 'fulltime';

export interface NotifySettings {
  muted: boolean;
  volume: number;
  events: Record<NotifyEventKey, boolean>;
  songName: string | null;
  unlocked: boolean;
}

const SETTINGS_KEY = 'vamoos:notify-settings';
const SETTINGS_KEY_LEGACY = 'tg3d:notify-settings';
const SONG_KEY = 'vamoos:goal-song';
const DEFAULT_CHEER_URL = '/sounds/cheer.wav';
const DEFAULT_SONG_LABEL = 'Stadium cheer';

const DEFAULTS: NotifySettings = {
  muted: false,
  volume: 1,
  events: {
    goal: true,
    kickoff: false,
    fulltime: true,
  },
  songName: null,
  unlocked: false,
};

let audio: HTMLAudioElement | null = null;
let objectUrl: string | null = null;
let usingCustomSong = false;

function loadDefaultCheer(): HTMLAudioElement {
  const el = new Audio(DEFAULT_CHEER_URL);
  el.preload = 'auto';
  el.volume = readSettings().volume;
  usingCustomSong = false;
  return el;
}

function readSettings(): NotifySettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY) ?? localStorage.getItem(SETTINGS_KEY_LEGACY);
    if (!raw) return { ...DEFAULTS, events: { ...DEFAULTS.events } };
    const parsed = JSON.parse(raw) as Partial<NotifySettings>;
    return {
      muted: Boolean(parsed.muted),
      volume: typeof parsed.volume === 'number' ? parsed.volume : DEFAULTS.volume,
      events: {
        goal: parsed.events?.goal ?? true,
        kickoff: parsed.events?.kickoff ?? false,
        fulltime: parsed.events?.fulltime ?? true,
      },
      songName: parsed.songName ?? null,
      unlocked: Boolean(parsed.unlocked),
    };
  } catch {
    return { ...DEFAULTS, events: { ...DEFAULTS.events } };
  }
}

function writeSettings(settings: NotifySettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  window.dispatchEvent(new Event('vamoos:notify'));
}

export function getNotifySettings(): NotifySettings {
  return readSettings();
}

export function updateNotifySettings(patch: Partial<NotifySettings>): NotifySettings {
  const current = readSettings();
  const next: NotifySettings = {
    ...current,
    ...patch,
    events: {
      ...current.events,
      ...(patch.events ?? {}),
    },
  };
  writeSettings(next);
  if (typeof patch.volume === 'number' && audio) {
    audio.volume = patch.volume;
  }
  return next;
}

export function subscribeNotify(listener: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === SETTINGS_KEY || e.key === SETTINGS_KEY_LEGACY) listener();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener('vamoos:notify', listener);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('vamoos:notify', listener);
  };
}

async function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('vamoos', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('audio')) {
        db.createObjectStore('audio');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveGoalSong(file: File): Promise<NotifySettings> {
  const buffer = await file.arrayBuffer();
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('audio', 'readwrite');
    tx.objectStore('audio').put({ buffer, type: file.type || 'audio/mpeg', name: file.name }, SONG_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  await reloadAudioFromDb();
  usingCustomSong = true;
  return updateNotifySettings({ songName: file.name, unlocked: true });
}

export async function clearGoalSong(): Promise<NotifySettings> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('audio', 'readwrite');
    tx.objectStore('audio').delete(SONG_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
  audio = loadDefaultCheer();
  return updateNotifySettings({ songName: null });
}

export async function reloadAudioFromDb(): Promise<void> {
  try {
    const db = await openDb();
    const record = await new Promise<{ buffer: ArrayBuffer; type: string; name: string } | undefined>(
      (resolve, reject) => {
        const tx = db.transaction('audio', 'readonly');
        const req = tx.objectStore('audio').get(SONG_KEY);
        req.onsuccess = () => resolve(req.result as { buffer: ArrayBuffer; type: string; name: string } | undefined);
        req.onerror = () => reject(req.error);
      },
    );
    db.close();

    if (!record) {
      audio = loadDefaultCheer();
      return;
    }

    if (objectUrl) URL.revokeObjectURL(objectUrl);
    const blob = new Blob([record.buffer], { type: record.type });
    objectUrl = URL.createObjectURL(blob);
    audio = new Audio(objectUrl);
    audio.preload = 'auto';
    audio.volume = readSettings().volume;
    usingCustomSong = true;
  } catch (err) {
    console.warn('[goalSong] failed to load stored song', err);
    audio = loadDefaultCheer();
  }
}

export function unlockAudio(): NotifySettings {
  const settings = updateNotifySettings({ unlocked: true });
  if (!audio) audio = loadDefaultCheer();

  const prev = audio.volume;
  audio.volume = 0;
  void audio
    .play()
    .then(() => {
      audio?.pause();
      if (audio) {
        audio.currentTime = 0;
        audio.volume = prev;
      }
    })
    .catch(() => {
      if (audio) audio.volume = prev;
    });

  return settings;
}

/** Crowd roar fallback if the cheer WAV fails to load. */
function cheerFallback(volume: number) {
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  const now = ctx.currentTime;
  const dur = 2.1;

  const bufferSize = Math.floor(ctx.sampleRate * dur);
  const buffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < bufferSize; i++) {
      const t = i / ctx.sampleRate;
      const env =
        Math.min(1, t / 0.08) *
        (t < 1.3 ? 1 : Math.max(0, 1 - (t - 1.3) / 0.8));
      const white = Math.random() * 2 - 1;
      lp = lp * 0.97 + white * 0.03;
      const roar = lp * 0.85 + white * 0.15;
      const whoa = Math.sin(2 * Math.PI * (420 + ch * 40) * t) * Math.exp(-3 * (t % 0.35)) * 0.12;
      data[i] = (roar * 0.7 + whoa) * env * volume * 0.9;
    }
  }

  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  src.buffer = buffer;
  gain.gain.value = Math.min(1, volume);
  src.connect(gain);
  gain.connect(ctx.destination);
  src.start(now);
  setTimeout(() => void ctx.close(), (dur + 0.3) * 1000);
}

export async function playGoalSong(): Promise<void> {
  const settings = readSettings();
  if (settings.muted) return;

  if (!audio) audio = loadDefaultCheer();

  try {
    audio.volume = settings.volume;
    audio.currentTime = 0;
    await audio.play();
    return;
  } catch (err) {
    console.warn('[goalSong] play blocked, using cheer fallback', err);
  }

  cheerFallback(settings.volume);
}

export function isUsingCustomSong(): boolean {
  return usingCustomSong;
}

export function defaultSongLabel(): string {
  return DEFAULT_SONG_LABEL;
}

export async function testGoalSong(): Promise<void> {
  unlockAudio();
  await playGoalSong();
}

export function shouldAlert(type: NotifyEventKey): boolean {
  const settings = readSettings();
  if (settings.muted) return false;
  return Boolean(settings.events[type]);
}
