import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdSlot } from '../components/AdSlot';
import { PredictionCard } from '../components/PredictionCard';
import { useI18n } from '../i18n/I18nProvider';
import { apiUrl } from '../lib/apiBase';
import {
  getDixonBoardCache,
  setDixonBoardCache,
  type DixonBoardCache,
  type LiveHeatPickCache,
} from '../lib/pageCache';

type Risk = 'green' | 'orange' | 'red';
type LiveFocus = 'corners' | 'shots';

type DixonPick = DixonBoardCache['live'][number];

function riskOf(p: DixonPick): Risk {
  if (p.confidence >= 0.58) return 'green';
  if (p.confidence >= 0.48) return 'orange';
  return 'red';
}

function pct(n: number): string {
  return `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`;
}

function PickCard({ pick }: { pick: DixonPick }) {
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
      risk={riskOf(pick)}
    />
  );
}

function HeatCard({
  pick,
  mode,
}: {
  pick: LiveHeatPickCache;
  mode: LiveFocus;
}) {
  const { t } = useI18n();
  const risk = mode === 'corners' ? pick.cornerRisk : pick.goalRisk;
  const confidence = mode === 'corners' ? pick.cornerConfidence : pick.goalConfidence;
  const confPct = Math.round(Math.max(0, Math.min(1, confidence)) * 100);
  const headline =
    mode === 'corners'
      ? t('predHeatCornerPick', {
          total: pick.cornersTotal,
          more: pct(pick.pNextCorner),
        })
      : t('predHeatShotPick', {
          total: pick.shotsOnTotal,
          more: pct(pick.pNextGoal),
        });

  const body = (
    <>
      <p className="pred-card__match">
        {pick.home} vs {pick.away}
        <span className="pred-card__meta">
          {' '}
          · {pick.score} · {pick.minute}'
        </span>
      </p>
      <p className="pred-card__league-line">{pick.league}</p>
      <p className="pred-card__pick">{headline}</p>
      <ul className="pred-card__markets" aria-label={t('predMarketsAria')}>
        <li className="pred-card__market">
          <span className="pred-card__market-label">{t('predHeatCorners')}</span>
          <span className="pred-card__market-value">
            {pick.cornersHome}-{pick.cornersAway} ({pick.cornersTotal})
          </span>
          <span className="pred-card__market-prob">{pct(pick.pNextCorner)}</span>
        </li>
        <li className="pred-card__market">
          <span className="pred-card__market-label">{t('predHeatMoreCorners')}</span>
          <span className="pred-card__market-value">
            +{pick.expectedExtraCorners.toFixed(1)} {t('predHeatExpected')}
          </span>
          <span className="pred-card__market-prob">{pick.cornerPick}</span>
        </li>
        <li className="pred-card__market">
          <span className="pred-card__market-label">{t('predHeatSot')}</span>
          <span className="pred-card__market-value">
            {pick.shotsOnHome}-{pick.shotsOnAway} ({pick.shotsOnTotal})
          </span>
          <span className="pred-card__market-prob">{pct(pick.pNextGoal)}</span>
        </li>
        <li className="pred-card__market">
          <span className="pred-card__market-label">{t('predHeatMoreGoals')}</span>
          <span className="pred-card__market-value">
            +{pick.expectedExtraGoals.toFixed(1)} {t('predHeatExpected')}
          </span>
          <span className="pred-card__market-prob">{pick.goalPick}</span>
        </li>
      </ul>
      <div className={`pred-heat-risk pred-heat-risk--${risk}`}>{risk}</div>
      <div className="pred-card__bar" aria-hidden>
        <span className="pred-card__bar-fill" style={{ width: `${confPct}%` }} />
      </div>
      <p className="pred-card__pct">
        {confPct}% {t('predConfidence')}
      </p>
    </>
  );

  return (
    <Link className="pred-card" to={`/match/${pick.liveId}`}>
      {body}
    </Link>
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
  const [liveFocus, setLiveFocus] = useState<LiveFocus>('corners');

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
    const id = window.setInterval(() => void loadBoard(false, true), 45_000);
    return () => window.clearInterval(id);
  }, [loadBoard]);

  const heatPool =
    liveFocus === 'corners'
      ? board?.liveHeat?.corners ?? []
      : board?.liveHeat?.shots ?? [];

  const upcomingPool = board?.upcoming ?? [];

  const visibleHeat = useMemo(() => {
    const q = query.trim().toLowerCase();
    return heatPool.filter((m) => {
      const risk = liveFocus === 'corners' ? m.cornerRisk : m.goalRisk;
      if (filter !== 'all' && risk !== filter) return false;
      if (!q) return true;
      const hay = `${m.home} ${m.away} ${m.league} ${m.cornerPick} ${m.goalPick}`.toLowerCase();
      return q.split(/\s+/).every((t) => hay.includes(t));
    });
  }, [heatPool, filter, query, liveFocus]);

  const visibleUpcoming = useMemo(() => {
    const q = query.trim().toLowerCase();
    return upcomingPool
      .filter((m) => {
        if (filter !== 'all' && riskOf(m) !== filter) return false;
        if (!q) return true;
        const hay = `${m.home} ${m.away} ${m.league} ${m.pick}`.toLowerCase();
        return q.split(/\s+/).every((t) => hay.includes(t));
      })
      .sort((a, b) => b.heat - a.heat || b.confidence - a.confidence);
  }, [upcomingPool, filter, query]);

  const poolForCounts = tab === 'live' ? heatPool : upcomingPool;
  const counts = useMemo(() => {
    const c = { green: 0, orange: 0, red: 0 };
    if (tab === 'live') {
      for (const m of heatPool) {
        const r = liveFocus === 'corners' ? m.cornerRisk : m.goalRisk;
        c[r] += 1;
      }
    } else {
      for (const m of upcomingPool) c[riskOf(m)] += 1;
    }
    return c;
  }, [tab, heatPool, upcomingPool, liveFocus]);

  const liveCount =
    (board?.liveHeat?.corners.length ?? 0) + (board?.liveHeat?.shots.length ?? 0) > 0
      ? Math.max(board?.liveHeat?.corners.length ?? 0, board?.liveHeat?.shots.length ?? 0)
      : board?.live.length ?? 0;

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

      <p className="pred-model-tag">
        {tab === 'live' ? t('predModelLiveHeat') : t('predModelDc')}
      </p>
      <p className="page-lede muted">
        {tab === 'live' ? t('predGuideLive') : t('predGuideUpcoming')}{' '}
        <Link to="/how-predictions-work" className="inline-link">
          {t('predGuideLink')}
        </Link>
      </p>

      <div className="sort-bar pred-bucket-bar" role="group" aria-label={t('predBucketAria')}>
        <button
          type="button"
          className={`sort-bar__btn${tab === 'live' ? ' sort-bar__btn--on' : ''}`}
          onClick={() => setTab('live')}
        >
          {t('predLiveTab', { n: liveCount })}
        </button>
        <button
          type="button"
          className={`sort-bar__btn${tab === 'upcoming' ? ' sort-bar__btn--on' : ''}`}
          onClick={() => setTab('upcoming')}
        >
          {t('predUpcomingTab', { n: board?.upcoming.length ?? 0 })}
        </button>
      </div>

      {tab === 'live' ? (
        <div className="sort-bar pred-bucket-bar" role="group" aria-label={t('predLiveFocusAria')}>
          <button
            type="button"
            className={`sort-bar__btn${liveFocus === 'corners' ? ' sort-bar__btn--on' : ''}`}
            onClick={() => setLiveFocus('corners')}
          >
            {t('predFocusCorners', { n: board?.liveHeat?.corners.length ?? 0 })}
          </button>
          <button
            type="button"
            className={`sort-bar__btn${liveFocus === 'shots' ? ' sort-bar__btn--on' : ''}`}
            onClick={() => setLiveFocus('shots')}
          >
            {t('predFocusShots', { n: board?.liveHeat?.shots.length ?? 0 })}
          </button>
        </div>
      ) : null}

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
              ['all', t('predAll', { n: poolForCounts.length })],
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
            {tab === 'live'
              ? t('predMetaLiveHeat', {
                  corners: board.liveHeat?.corners.length ?? 0,
                  shots: board.liveHeat?.shots.length ?? 0,
                  time: new Date(board.at).toLocaleTimeString(lang === 'ar' ? 'ar' : 'en'),
                })
              : t('predMetaDc', {
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
      {tab === 'live' && board?.liveHeat?.notice ? (
        <p className="pred-notice">{board.liveHeat.notice}</p>
      ) : null}
      {tab === 'upcoming' && board?.notice ? <p className="pred-notice">{board.notice}</p> : null}

      {(tab === 'live' ? visibleHeat : visibleUpcoming).length > 0 ? (
        <AdSlot format="banner" className="ad-slot--feed" />
      ) : null}

      <div className="pred-list">
        {tab === 'live'
          ? visibleHeat.map((p, i) => (
              <div key={`${liveFocus}-${p.id}`}>
                <HeatCard pick={p} mode={liveFocus} />
                {i === 2 ? <AdSlot format="infeed" className="ad-slot--feed" /> : null}
              </div>
            ))
          : visibleUpcoming.map((p, i) => (
              <div key={p.id}>
                <PickCard pick={p} />
                {i === 2 ? <AdSlot format="infeed" className="ad-slot--feed" /> : null}
              </div>
            ))}
      </div>

      {!busy && board && (tab === 'live' ? visibleHeat : visibleUpcoming).length === 0 ? (
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
