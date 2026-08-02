import { useEffect, useRef, useState } from 'react';
import type { LiveMatch, MatchEvent } from '../types';
import { playGoalSong, shouldAlert, unlockAudio, type NotifyEventKey } from '../lib/goalSong';
import { getFavorites } from '../store/favorites';

function mapEventType(type: MatchEvent['type']): NotifyEventKey | null {
  if (type === 'goal') return 'goal';
  if (type === 'kickoff') return 'kickoff';
  if (type === 'fulltime') return 'fulltime';
  return null;
}

function isFinished(status: string): boolean {
  return ['FT', 'AET', 'PEN', 'AWD', 'WO', 'ABD', 'CANC'].includes(status);
}

function isLiveStatus(status: string): boolean {
  return ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE'].includes(status);
}

export function useAlertBridge(
  lastEvent: MatchEvent | null,
  eventVersion: number,
  matches: LiveMatch[],
) {
  const [toasts, setToasts] = useState<Array<{ id: string; text: string }>>([]);
  const [audioGateOpen, setAudioGateOpen] = useState(() => !getNotifySettingsUnlocked());
  const seenServer = useRef(0);
  const scoreMap = useRef(new Map<number, { h: number; a: number; status: string }>());
  const recentKeys = useRef(new Map<string, number>());

  const fire = (opts: {
    key: NotifyEventKey;
    matchId: number;
    message: string;
    dedupe: string;
  }) => {
    const now = Date.now();
    for (const [k, at] of recentKeys.current) {
      if (now - at > 45_000) recentKeys.current.delete(k);
    }
    if (recentKeys.current.has(opts.dedupe)) return;
    recentKeys.current.set(opts.dedupe, now);

    if (!shouldAlert(opts.key)) return;

    const id = `${opts.dedupe}-${now}`;
    setToasts((t) => [{ id, text: opts.message }, ...t].slice(0, 5));

    if (opts.key === 'goal') {
      void playGoalSong();
      try {
        navigator.vibrate?.([80, 40, 120]);
      } catch {
        /* ignore */
      }
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification('VAMOOS', {
          body: opts.message,
          tag: `vamoos-${opts.matchId}-${opts.key}`,
          silent: opts.key === 'goal' ? false : true,
        });
      } catch {
        /* ignore */
      }
    }
  };

  // Server-pushed events (WebSocket)
  useEffect(() => {
    if (!lastEvent || eventVersion === seenServer.current) return;
    seenServer.current = eventVersion;

    const favs = getFavorites();
    if (!favs.includes(lastEvent.matchId)) return;

    const key = mapEventType(lastEvent.type);
    if (!key) return;

    const h = lastEvent.match.goals.home ?? 0;
    const a = lastEvent.match.goals.away ?? 0;
    fire({
      key,
      matchId: lastEvent.matchId,
      message: lastEvent.message,
      dedupe: `${key}:${lastEvent.matchId}:${h}-${a}:${lastEvent.match.status}`,
    });
  }, [lastEvent, eventVersion]);

  // Fast path: detect goal / FT / kickoff from any scoreboard update (WS or HTTP)
  useEffect(() => {
    const favs = new Set(getFavorites());

    for (const m of matches) {
      const h = m.goals.home ?? 0;
      const a = m.goals.away ?? 0;
      const prev = scoreMap.current.get(m.id);
      scoreMap.current.set(m.id, { h, a, status: m.status });

      if (!prev || !favs.has(m.id)) continue;

      if (h > prev.h || a > prev.a) {
        fire({
          key: 'goal',
          matchId: m.id,
          message: `GOAL! ${m.home.name} ${h}-${a} ${m.away.name}`,
          dedupe: `goal:${m.id}:${h}-${a}:${m.status}`,
        });
      } else if (!isFinished(prev.status) && isFinished(m.status)) {
        fire({
          key: 'fulltime',
          matchId: m.id,
          message: `FT ${m.home.name} ${h}-${a} ${m.away.name}`,
          dedupe: `fulltime:${m.id}:${h}-${a}`,
        });
      } else if (
        !isLiveStatus(prev.status) &&
        isLiveStatus(m.status) &&
        (prev.status === 'NS' || prev.status === 'PST')
      ) {
        fire({
          key: 'kickoff',
          matchId: m.id,
          message: `${m.home.name} vs ${m.away.name} kicked off`,
          dedupe: `kickoff:${m.id}`,
        });
      }
    }
  }, [matches]);

  const dismiss = (id: string) => setToasts((t) => t.filter((x) => x.id !== id));

  const enableAudio = () => {
    unlockAudio();
    setAudioGateOpen(false);
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  };

  return { toasts, dismiss, audioGateOpen, enableAudio };
}

function getNotifySettingsUnlocked(): boolean {
  try {
    const raw =
      localStorage.getItem('vamoos:notify-settings') ??
      localStorage.getItem('tg3d:notify-settings');
    if (!raw) return false;
    return Boolean((JSON.parse(raw) as { unlocked?: boolean }).unlocked);
  } catch {
    return false;
  }
}
