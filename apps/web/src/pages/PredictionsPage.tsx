import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdSlot } from '../components/AdSlot';
import { PredictionCard } from '../components/PredictionCard';
import { useI18n } from '../i18n/I18nProvider';
import { apiUrl } from '../lib/apiBase';
import { getLateScanCache, setLateScanCache, type LateScanCache } from '../lib/pageCache';

type Risk = 'green' | 'orange' | 'red';

type LatePick = NonNullable<LateScanCache['matches']>[number];
type LateScan = LateScanCache;

function riskOf(p: LatePick): Risk {
  return p.risk ?? p.goalRisk ?? 'red';
}

function MatchRow({ pick }: { pick: LatePick }) {
  const { t } = useI18n();
  const risk = riskOf(pick);
  const riskLabel =
    risk === 'green' ? t('riskBet') : risk === 'orange' ? t('riskMaybe') : t('riskSkip');
  const pickLabel = `${pick.minute}' · ${t('statGoal')} · ${riskLabel}`;

  if (pick.liveId) {
    return (
      <PredictionCard
        home={pick.home}
        away={pick.away}
        pick={pickLabel}
        confidence={pick.pNextGoal}
        href={`/match/${pick.liveId}`}
        risk={risk}
      />
    );
  }

  return (
    <PredictionCard
      home={pick.home}
      away={pick.away}
      pick={pickLabel}
      confidence={pick.pNextGoal}
      href={pick.url}
      external
      risk={risk}
    />
  );
}

export function PredictionsPage() {
  const { t, lang } = useI18n();
  const [scan, setScan] = useState<LateScan | null>(() => getLateScanCache());
  const [scanBusy, setScanBusy] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | Risk>('all');
  const [query, setQuery] = useState('');

  const loadScan = useCallback(async (force = false, soft = false) => {
    const hasCache = Boolean(getLateScanCache());
    // Only show busy on manual refresh, or the very first load with no cache.
    if (!soft && !hasCache) {
      setScanBusy(true);
      setScanError(null);
    } else if (!soft && force && hasCache) {
      setScanBusy(true);
    }
    try {
      const q = force ? '?refresh=1&minMinute=75' : '?minMinute=75';
      const res = await fetch(apiUrl(`/api/predictions/late-goals${q}`));
      const json = (await res.json()) as LateScan & { error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setLateScanCache(json);
      setScan(json);
      setScanError(null);
    } catch (err) {
      if (!soft && !hasCache) setScanError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setScanBusy(false);
    }
  }, []);

  useEffect(() => {
    // Soft if we already have cached tips — never blank the page on mount.
    void loadScan(true, Boolean(getLateScanCache()));
    const id = window.setInterval(() => void loadScan(false, true), 20_000);
    return () => window.clearInterval(id);
  }, [loadScan]);

  const matches = useMemo(() => {
    if (!scan) return [];
    return scan.matches?.length ? scan.matches : [...scan.picks, ...scan.watch];
  }, [scan]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return matches
      .filter((m) => {
        if (filter !== 'all' && riskOf(m) !== filter) return false;
        if (!q) return true;
        const hay = `${m.home} ${m.away} ${m.league} ${m.score}`.toLowerCase();
        return q.split(/\s+/).every((t) => hay.includes(t));
      })
      .sort((a, b) => {
        // Closest to full time first
        if (b.minute !== a.minute) return b.minute - a.minute;
        const rank = { green: 2, orange: 1, red: 0 } as const;
        return rank[riskOf(b)] - rank[riskOf(a)];
      });
  }, [matches, filter, query]);

  const counts = useMemo(() => {
    const c = { green: 0, orange: 0, red: 0 };
    for (const m of matches) c[riskOf(m)] += 1;
    return c;
  }, [matches]);

  return (
    <section className="page page--predict">
      <div className="pred-head pred-head--lite">
        <p className="section-label">{t('predTitle')}</p>
        <button
          type="button"
          className="btn btn--ghost btn--compact"
          disabled={scanBusy}
          onClick={() => void loadScan(true)}
        >
          {scanBusy ? t('predUpdating') : t('predRefresh')}
        </button>
      </div>

      <AdSlot format="banner" className="ad-slot--feed" />

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
              ['all', t('predAll', { n: matches.length })],
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
        {scan ? (
          <p className="pred-meta">
            {t('predMeta', {
              live: scan.liveTotal,
              late: scan.lateWindowTotal,
              time: new Date(scan.at).toLocaleTimeString(lang === 'ar' ? 'ar' : 'en'),
            })}
          </p>
        ) : scanBusy ? (
          <p className="pred-meta muted">{t('predLoading')}</p>
        ) : null}
      </div>

      {scanError ? <p className="predict-error">{scanError}</p> : null}
      {scan?.notice ? <p className="pred-notice">{scan.notice}</p> : null}

      <div className="pred-list">
        {visible.map((p, i) => (
          <div key={p.matchId}>
            <MatchRow pick={p} />
            {i === 2 ? <AdSlot format="infeed" className="ad-slot--feed" /> : null}
          </div>
        ))}
      </div>

      {!scanBusy && scan && visible.length === 0 ? (
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
