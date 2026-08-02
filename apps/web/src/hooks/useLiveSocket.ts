import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl, wsUrl } from '../lib/apiBase';
import type { LiveMatch, MatchEvent, ServerMessage } from '../types';

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

  const applySnapshot = useCallback(
    (payload: {
      matches: LiveMatch[];
      mode: 'live' | 'demo';
      rateLimited?: boolean;
      notice?: string | null;
    }) => {
      setMatches(payload.matches);
      setMode(payload.mode);
      setRateLimited(Boolean(payload.rateLimited));
      setNotice(payload.notice ?? null);
    },
    [],
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
      // HTTP feed is enough to treat the app as online even if WS is blocked.
      setConnected(true);
    } catch {
      /* ignore — WS may still be healthy */
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
          if (idx === -1) return [...prev, msg.event.match];
          const next = [...prev];
          next[idx] = msg.event.match;
          return next;
        });
      }
    },
    [applySnapshot],
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
        setConnected(true);
        void pullHttp();
      };

      socket.onmessage = (ev) => {
        if (typeof ev.data === 'string') handleMessage(ev.data);
      };

      socket.onclose = () => {
        setConnected(false);
        setMode((m) => (m === 'connecting' ? 'connecting' : m));
        const delay = Math.min(8000, 500 * 2 ** retryRef.current);
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
      socketRef.current?.close();
    };
  }, [handleMessage, pullHttp]);

  // Safety net: if WS stalls, HTTP still refreshes scores (also feeds fast client alerts).
  useEffect(() => {
    void pullHttp();
    const timer = window.setInterval(() => void pullHttp(), 2_000);
    return () => window.clearInterval(timer);
  }, [pullHttp]);

  return { matches, mode, connected, rateLimited, notice, lastEvent, eventVersion };
}
