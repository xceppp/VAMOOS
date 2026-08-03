import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdSlot } from '../components/AdSlot';
import { PredictionCard } from '../components/PredictionCard';
import { useI18n } from '../i18n/I18nProvider';
import { apiUrl } from '../lib/apiBase';
import { getDixonBoardCache, setDixonBoardCache, type DixonBoardCache } from '../lib/pageCache';

type Risk = 'green' | 'orange' | 'red';

type DixonPick = DixonBoardCache['live'][number];

function riskOf(p: DixonPick): Risk {
  if (p.confidence >= 0.58) return 'green';
  if (p.confidence >= 0.48) return 'orange';
  return 'red';
}

function PickCard({ pick }: { pick: DixonPick }) {
  const risk = riskOf(pick);
  const metaBits = [
    pick.score || null,
    pick.minute != null ? `${pick.minute}'` : null,
  ].filter(Boolean);
  const href = pick.liveId ? `/match/${pick.liveId}` : undefined;

  return (
    <PredictionCard
      home={pick.home}
      away={pick.away}
      pick={pick.pick}
      confidence={pick.confidence}
      scoreline={pick.mostLikelyScore}
      meta={metaBits.join(' · ') || undefined}
      markets={pick.markets}
      href={href}
      risk={risk}
    />
  );
}

export function PredictionsPage() {
  const { t, lang } = useI18n();
  const [board, setBoard] = useState<DixonBoardCache | null>(() => getDixonBoardCache());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | Risk>('all');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'live' | 'upcoming'>('live');

  const loadBoard = useCallback(async (force = false, soft = false) => {
    const hasCache = Boolean(getDixonBoardCache());
    if (!soft && (!hasCache || force)) setBusy(true);
    try {
      const q = force ? '?refresh=1' : '';
      const res = await fetch(apiUrl(`/api/predictions/board${q}`));
      const json = (await res.json()) as DixonBoardCache & { error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setDixonBoardCache(json);
      setBoard(json);
      setError(null);
    } catch (err) {
      if (!soft && !hasCache) setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadBoard(true, Boolean(getDixonBoardCache()));
    const id = window.setInterval(() => void loadBoard(false, true), 60_000);
    return () => window.clearInterval(id);
  }, [loadBoard]);

  const pool = tab === 'live' ? board?.live ?? [] : board?.upcoming ?? [];

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pool
      .filter((m) => {
        if (filter !== 'all' && riskOf(m) !== filter) return false;
        if (!q) return true;
        const hay = `${m.home} ${m.away} ${m.league} ${m.pick}`.toLowerCase();
        return q.split(/\s+/).every((t) => hay.includes(t));
      })
      .sort((a, b) => b.heat - a.heat || b.confidence - a.confidence);
  }, [pool, filter, query]);

  const counts = useMemo(() => {
    const c = { green: 0, orange: 0, red: 0 };
    for (const m of pool) c[riskOf(m)] += 1;
    return c;
  }, [pool]);

  return (
    <section className="page page--predict">
      <div className="pred-head pred-head--lite">
        <p className="section-label">{t('predTitle')}</p>
        <button
          type="button"
          className="btn btn--ghost btn--compact"
          disabled={busy}
          onClick={() => void loadBoard(true, false)}
        >
          {busy ? t('predUpdating') : t('predRefresh')}
        </button>
      </div>

      <p className="pred-model-tag">{t('predModelDc')}</p>

      <AdSlot format="banner" className="ad-slot--feed" />

      <div className="sort-bar pred-bucket-bar" role="group" aria-label={t('predBucketAria')}>
        <button
          type="button"
          className={`sort-bar__btn${tab === 'live' ? ' sort-bar__btn--on' : ''}`}
          onClick={() => setTab('live')}
        >
          {t('predLiveTab', { n: board?.live.length ?? 0 })}
        </button>
        <button
          type="button"
          className={`sort-bar__btn${tab === 'upcoming' ? ' sort-bar__btn--on' : ''}`}
          onClick={() => setTab('upcoming')}
        >
          {t('predUpcomingTab', { n: board?.upcoming.length ?? 0 })}
        </button>
      </div>

      <div className="pred-controls">
        <input
          className="pred-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('predSearch')}
          autoComplete="off"
        />
        <div className="pred-filters" role="group" aria-label={t('predFilter')}>
          {(
            [
              ['all', t('predAll', { n: pool.length })],
              ['green', t('predBet', { n: counts.green })],
              ['orange', t('predMaybe', { n: counts.orange })],
              ['red', t('predSkip', { n: counts.red })],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`pred-filter${filter === key ? ' is-on' : ''}${key !== 'all' ? ` pred-filter--${key}` : ''}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        {board ? (
          <p className="pred-meta">
            {t('predMetaDc', {
              live: board.live.length,
              upcoming: board.upcoming.length,
              time: new Date(board.at).toLocaleTimeString(lang === 'ar' ? 'ar' : 'en'),
            })}
          </p>
        ) : busy ? (
          <p className="pred-meta muted">{t('predLoading')}</p>
        ) : null}
      </div>

      {error ? <p className="predict-error">{error}</p> : null}
      {board?.notice ? <p className="pred-notice">{board.notice}</p> : null}

      <div className="pred-list">
        {visible.map((p, i) => (
          <div key={p.id}>
            <PickCard pick={p} />
            {i === 2 ? <AdSlot format="infeed" className="ad-slot--feed" /> : null}
          </div>
        ))}
      </div>

      {!busy && board && visible.length === 0 ? (
        <p className="pred-empty">
          {query.trim()
            ? t('predEmptySearch', { q: query.trim() })
            : t('predEmptyFilter')}
        </p>
      ) : null}

      <p className="pred-disclaimer">{t('predDisclaimer')}</p>
    </section>
  );
}
