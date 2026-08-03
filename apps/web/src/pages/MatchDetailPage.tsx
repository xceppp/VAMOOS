import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AdSlot } from '../components/AdSlot';
import { useI18n } from '../i18n/I18nProvider';
import { apiUrl } from '../lib/apiBase';
import type { LiveMatch } from '../types';

interface MatchStatRow {
  type: string;
  home: string | number | null;
  away: string | number | null;
}

interface MatchTimelineEvent {
  time: number | null;
  extra: number | null;
  type: string;
  detail: string;
  teamId: number | null;
  teamName: string;
  player: string | null;
  assist: string | null;
}

interface MatchLineupPlayer {
  id: number | null;
  name: string;
  number: number | null;
  pos: string | null;
}

interface MatchLineup {
  teamId: number;
  teamName: string;
  teamLogo?: string;
  formation: string | null;
  coach: string | null;
  startXI: MatchLineupPlayer[];
  substitutes: MatchLineupPlayer[];
}

interface MatchDetailPayload {
  match: LiveMatch;
  venue?: string;
  city?: string;
  referee?: string;
  round?: string;
  events: MatchTimelineEvent[];
  statistics: MatchStatRow[];
  statPeriods?: Array<{ name: string; statistics: MatchStatRow[] }>;
  lineups: MatchLineup[];
  mode: 'live' | 'demo';
}

interface MatchDetailPageProps {
  liveMatches: LiveMatch[];
  isFav: (id: number) => boolean;
  onToggle: (id: number) => void;
}

export function MatchDetailPage({ liveMatches, isFav, onToggle }: MatchDetailPageProps) {
  const { t } = useI18n();
  const { id } = useParams();
  const matchId = Number(id);
  const [data, setData] = useState<MatchDetailPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(
    () => !Number.isFinite(matchId) || !liveMatches.some((m) => m.id === matchId),
  );
  const [statTab, setStatTab] = useState(0);

  const liveHint = useMemo(
    () => liveMatches.find((m) => m.id === matchId) ?? null,
    [liveMatches, matchId],
  );

  useEffect(() => {
    if (!Number.isFinite(matchId)) {
      setError('Invalid match');
      setLoading(false);
      return;
    }

    let cancelled = false;
    const hasHint = liveMatches.some((m) => m.id === matchId);

    const load = (soft = false) => {
      // Never blank the scoreboard when we already have live data for this match.
      if (!soft && !hasHint && !data) {
        setLoading(true);
        setError(null);
      }
      void fetch(apiUrl(`/api/matches/${matchId}`), { cache: 'no-store' })
        .then(async (res) => {
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as { error?: string } | null;
            throw new Error(body?.error ?? `Could not load match (${res.status})`);
          }
          return res.json() as Promise<MatchDetailPayload>;
        })
        .then((payload) => {
          if (!cancelled) {
            setData(payload);
            setError(null);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled && !soft && !hasHint) {
            setError(err instanceof Error ? err.message : 'Failed to load');
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    load(hasHint);
    const timer = window.setInterval(() => load(true), 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only refetch when match id changes
  }, [matchId]);

  // Prefer live WS scoreboard when present — detail payload can lag behind a goal/FT.
  const match = useMemo(() => {
    const base = data?.match ?? liveHint;
    if (!base) return null;
    if (!liveHint) return base;
    if (!data?.match) return liveHint;
    return {
      ...data.match,
      ...liveHint,
      home: { ...data.match.home, ...liveHint.home },
      away: { ...data.match.away, ...liveHint.away },
      goals: liveHint.goals,
      status: liveHint.status,
      elapsed: liveHint.elapsed,
    };
  }, [data, liveHint]);
  const favorited = Number.isFinite(matchId) ? isFav(matchId) : false;

  const periodTabs = useMemo(() => {
    const periods = data?.statPeriods?.filter((p) => p.statistics.length) ?? [];
    if (periods.length > 0) return periods;
    if (data?.statistics?.length) return [{ name: 'Match', statistics: data.statistics }];
    return [];
  }, [data]);

  useEffect(() => {
    setStatTab(0);
  }, [matchId, periodTabs.length]);

  const activeStats = periodTabs[statTab]?.statistics ?? data?.statistics ?? [];

  return (
    <section className="page page--detail">
      <Link to="/" className="back-link">
        {t('backLive')}
      </Link>

      {loading && !match ? <p className="empty">{t('loadingMatch')}</p> : null}
      {error && !match ? <p className="empty">{error}</p> : null}

      {match ? (
        <>
          <header className="detail-hero">
            <div className="detail-hero__meta">
              <span>{match.league}</span>
              {match.country ? <span>· {match.country}</span> : null}
              {data?.round ? <span>· {data.round}</span> : null}
            </div>

            <div className="detail-hero__scoreboard">
              <div className="detail-hero__team">
                {match.home.logo ? <img src={match.home.logo} alt="" /> : <span className="crest crest--fallback" />}
                <strong>{match.home.name}</strong>
              </div>
              <div className="detail-hero__score">
                <span>
                  {match.goals.home ?? 0}
                  <i>–</i>
                  {match.goals.away ?? 0}
                </span>
                <em>
                  {match.elapsed != null &&
                  ['1H', '2H', 'ET', 'BT', 'P', 'LIVE'].includes(match.status)
                    ? `${match.elapsed}'`
                    : match.status}
                </em>
              </div>
              <div className="detail-hero__team detail-hero__team--away">
                {match.away.logo ? <img src={match.away.logo} alt="" /> : <span className="crest crest--fallback" />}
                <strong>{match.away.name}</strong>
              </div>
            </div>

            <div className="detail-hero__actions">
              <button
                type="button"
                className={`btn ${favorited ? 'btn--primary' : 'btn--ghost'}`}
                onClick={() => onToggle(match.id)}
              >
                {favorited ? t('favorited') : t('addFavorite')}
              </button>
            </div>

            <p className="detail-hero__info">
              {[data?.venue, data?.city].filter(Boolean).join(', ') || t('liveMatchStats')}
              {data?.referee ? ` · ${data.referee}` : ''}
              {data ? ` · ${t('autoRefresh')}` : ''}
            </p>
          </header>

          <AdSlot format="banner" className="ad-slot--feed" />

          {error ? <p className="settings__msg">{error}</p> : null}

          <div className="detail-grid">
            <section className="detail-panel">
              <h2>
                {t('stats')} {activeStats.length ? `(${activeStats.length})` : ''}
              </h2>
              {periodTabs.length > 1 ? (
                <div className="stat-tabs" role="tablist" aria-label="Stat period">
                  {periodTabs.map((p, idx) => (
                    <button
                      key={p.name}
                      type="button"
                      role="tab"
                      aria-selected={statTab === idx}
                      className={`stat-tabs__btn${statTab === idx ? ' is-on' : ''}`}
                      onClick={() => setStatTab(idx)}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              ) : null}
              {!activeStats.length ? (
                <p className="muted">{t('noStats')}</p>
              ) : (
                <ul className="stat-list">
                  {activeStats.map((row, idx) => (
                    <StatBar key={`${row.type}-${idx}`} row={row} />
                  ))}
                </ul>
              )}
            </section>

            <section className="detail-panel">
              <h2>{t('timeline')}</h2>
              {!data?.events.length ? (
                <p className="muted">{t('noEvents')}</p>
              ) : (
                <ol className="timeline">
                  {data.events.map((ev, idx) => (
                    <li key={`${ev.time}-${ev.type}-${ev.player}-${idx}`} className="timeline__item">
                      <span className="timeline__min">
                        {ev.time != null ? `${ev.time}${ev.extra ? `+${ev.extra}` : ''}'` : '—'}
                      </span>
                      <span className={`timeline__badge timeline__badge--${ev.type.toLowerCase()}`}>
                        {badgeLabel(ev)}
                      </span>
                      <span className="timeline__text">
                        <strong>{ev.player ?? ev.detail}</strong>
                        <em>
                          {ev.teamName}
                          {ev.assist ? ` · assist ${ev.assist}` : ''}
                          {ev.type !== 'Goal' ? ` · ${ev.detail}` : ''}
                        </em>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          <section className="detail-panel detail-panel--wide">
            <h2>{t('lineups')}</h2>
            {!data?.lineups.length ? (
              <p className="muted">{t('noLineups')}</p>
            ) : (
              <div className="lineups">
                {data.lineups.map((lineup) => (
                  <div key={lineup.teamId} className="lineup">
                    <header>
                      {lineup.teamLogo ? <img src={lineup.teamLogo} alt="" width={22} height={22} /> : null}
                      <strong>{lineup.teamName}</strong>
                      <span>{lineup.formation ?? 'Formation TBA'}</span>
                    </header>
                    {lineup.coach ? <p className="muted">Coach: {lineup.coach}</p> : null}
                    <h3>XI</h3>
                    <ul>
                      {lineup.startXI.map((p) => (
                        <li key={`${lineup.teamId}-xi-${p.number}-${p.name}`}>
                          <span>{p.number ?? '—'}</span>
                          {p.name}
                          {p.pos ? <em>{p.pos}</em> : null}
                        </li>
                      ))}
                    </ul>
                    {lineup.substitutes.length > 0 ? (
                      <>
                        <h3>Bench</h3>
                        <ul>
                          {lineup.substitutes.map((p) => (
                            <li key={`${lineup.teamId}-sub-${p.number}-${p.name}`}>
                              <span>{p.number ?? '—'}</span>
                              {p.name}
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}

function StatBar({ row }: { row: MatchStatRow }) {
  const homeNum = parseStat(row.home);
  const awayNum = parseStat(row.away);
  const total = homeNum + awayNum;
  const homePct = total > 0 ? (homeNum / total) * 100 : 50;

  return (
    <li className="stat-row">
      <div className="stat-row__values">
        <strong>{formatStat(row.home)}</strong>
        <span>{row.type}</span>
        <strong>{formatStat(row.away)}</strong>
      </div>
      <div className="stat-row__bar" aria-hidden>
        <i style={{ width: `${homePct}%` }} />
      </div>
    </li>
  );
}

function parseStat(value: string | number | null): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  const n = Number.parseFloat(value.replace('%', ''));
  return Number.isFinite(n) ? n : 0;
}

function formatStat(value: string | number | null): string {
  if (value == null) return '—';
  return String(value);
}

function badgeLabel(ev: MatchTimelineEvent): string {
  if (ev.type === 'Goal') return 'GOAL';
  if (ev.type === 'Card') return ev.detail.includes('Yellow') ? 'YC' : 'RC';
  if (ev.type === 'subst') return 'SUB';
  return ev.type.slice(0, 3).toUpperCase();
}
