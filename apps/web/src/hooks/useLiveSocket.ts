import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl, wsUrl } from '../lib/apiBase';
import type { LiveMatch, MatchEvent, ServerMessage } from '../types';

function matchSig(m: LiveMatch): string {
  const g = m.goals;
  const s = m.stats;
  const o = m.odds;
  return [
    m.id,
    m.status,
    m.elapsed ?? '',
    g.home ?? '',
    g.away ?? '',
    m.home.name,
    m.away.name,
    m.home.logo ?? '',
    m.away.logo ?? '',
    s?.possessionHome ?? '',
    s?.possessionAway ?? '',
    s?.cornersHome ?? '',
    s?.cornersAway ?? '',
    o?.home ?? '',
    o?.draw ?? '',
    o?.away ?? '',
    m.popularity ?? '',
  ].join('|');
}

function boardSig(matches: LiveMatch[]): string {
  return matches.map(matchSig).join('||');
}

export function useLiveSocket() {
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [mode, setMode] = useState<'live' | 'demo' | 'connecting'>('connecting');
  const [connected, setConnected] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState<MatchEvent | null>(null);
  const [eventVersion, setEventVersion] = useState(0);

  const retryRef = useRef(0);
  const socketRef = useRef<WebSocket | null>(null);
  const boardSigRef = useRef('');
  const hasDataRef = useRef(false);
  const wsOpenRef = useRef(false);
  const lastOkAtRef = useRef(0);
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markOnline = useCallback(() => {
    lastOkAtRef.current = Date.now();
    if (disconnectTimerRef.current) {
      clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
    }
    setConnected(true);
  }, []);

  const scheduleOffline = useCallback(() => {
    if (disconnectTimerRef.current) return;
    // Grace period so brief WS blips don't flash "reconnecting"
    disconnectTimerRef.current = setTimeout(() => {
      disconnectTimerRef.current = null;
      if (!wsOpenRef.current && Date.now() - lastOkAtRef.current > 4_000) {
        setConnected(false);
      }
    }, 2_500);
  }, []);

  const applySnapshot = useCallback(
    (payload: {
      matches: LiveMatch[];
      mode: 'live' | 'demo';
      rateLimited?: boolean;
      notice?: string | null;
    }) => {
      // Never wipe a populated board with an empty payload (transient poll glitch).
      if (payload.matches.length === 0 && hasDataRef.current) {
        setMode(payload.mode);
        setRateLimited(Boolean(payload.rateLimited));
        if (payload.notice !== undefined) setNotice(payload.notice ?? null);
        markOnline();
        return;
      }

      const nextSig = boardSig(payload.matches);
      if (nextSig !== boardSigRef.current) {
        boardSigRef.current = nextSig;
        setMatches(payload.matches);
      }
      if (payload.matches.length > 0) hasDataRef.current = true;
      setMode(payload.mode);
      setRateLimited(Boolean(payload.rateLimited));
      setNotice(payload.notice ?? null);
      markOnline();
    },
    [markOnline],
  );

  const pullHttp = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/matches'), { cache: 'no-store' });
      if (!res.ok) return;
      const body = (await res.json()) as {
        matches: LiveMatch[];
        mode: 'live' | 'demo';
        rateLimited?: boolean;
        notice?: string | null;
      };
      applySnapshot(body);
    } catch {
      /* WS may still be healthy */
    }
  }, [applySnapshot]);

  const handleMessage = useCallback(
    (raw: string) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(raw) as ServerMessage;
      } catch {
        return;
      }

      if (msg.type === 'snapshot') {
        applySnapshot(msg);
        return;
      }

      if (msg.type === 'event') {
        setLastEvent(msg.event);
        setEventVersion((v) => v + 1);
        setMatches((prev) => {
          const idx = prev.findIndex((m) => m.id === msg.event.matchId);
          let next: LiveMatch[];
          if (idx === -1) {
            next = [...prev, msg.event.match];
          } else if (matchSig(prev[idx]!) === matchSig(msg.event.match)) {
            return prev;
          } else {
            next = [...prev];
            next[idx] = msg.event.match;
          }
          boardSigRef.current = boardSig(next);
          hasDataRef.current = true;
          return next;
        });
        markOnline();
      }
    },
    [applySnapshot, markOnline],
  );

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (cancelled) return;
      const socket = new WebSocket(wsUrl());
      socketRef.current = socket;

      socket.onopen = () => {
        retryRef.current = 0;
        wsOpenRef.current = true;
        markOnline();
        void pullHttp();
      };

      socket.onmessage = (ev) => {
        if (typeof ev.data === 'string') handleMessage(ev.data);
      };

      socket.onclose = () => {
        wsOpenRef.current = false;
        scheduleOffline();
        const delay = Math.min(8_000, 500 * 2 ** retryRef.current);
        retryRef.current += 1;
        timer = setTimeout(connect, delay);
      };

      socket.onerror = () => {
        socket.close();
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
      socketRef.current?.close();
    };
  }, [handleMessage, markOnline, pullHttp, scheduleOffline]);

  // Adaptive HTTP safety net — slow when WS is up so the board doesn't thrash.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      if (cancelled) return;
      void pullHttp().finally(() => {
        if (cancelled) return;
        const delay = wsOpenRef.current ? 10_000 : 2_500;
        timer = setTimeout(tick, delay);
      });
    };

    void pullHttp().finally(() => {
      if (!cancelled) timer = setTimeout(tick, wsOpenRef.current ? 10_000 : 2_500);
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [pullHttp]);

  return { matches, mode, connected, rateLimited, notice, lastEvent, eventVersion };
}
