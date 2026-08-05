import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AdSlot } from '../components/AdSlot';
import AttackPitch from '../components/AttackPitch';
import { useAttackPressure } from '../hooks/useAttackPressure';
import { useI18n } from '../i18n/I18nProvider';
import { apiUrl } from '../lib/apiBase';
import { buildLivePulse, featuredStatRows } from '../lib/livePulse';
import type { LiveMatch } from '../types';
import meterStyles from './MatchMeters.module.css';
import pulseStyles from './MatchPulse.module.css';

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

function DualMeter({
  label,
  home,
  away,
  kind,
}: {
  label: string;
  home: number;
  away: number;
  kind: 'percent' | 'count';
}) {
  const total = home + away;
  const homePct = total > 0 ? (home / total) * 100 : 50;
  const homeLabel = kind === 'percent' ? `${Math.round(home)}%` : String(home);
  const awayLabel = kind === 'percent' ? `${Math.round(away)}%` : String(away);
  const homeLeads = home > away;
  const awayLeads = away > home;

  return (
    <li className={meterStyles.row}>
      <div className={meterStyles.top}>
        <strong className={`num${homeLeads ? ` ${meterStyles.lead}` : ''}`}>{homeLabel}</strong>
        <span>{label}</span>
        <strong className={`num${awayLeads ? ` ${meterStyles.lead}` : ''}`}>{awayLabel}</strong>
      </div>
      <div className={meterStyles.track} aria-hidden>
        <span className={meterStyles.home} style={{ width: `${homePct}%` }} />
        <span className={meterStyles.away} style={{ width: `${100 - homePct}%` }} />
      </div>
    </li>
  );
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
  const [showAllStats, setShowAllStats] = useState(false);
  const [statCornerBeeps, setStatCornerBeeps] = useState<MatchTimelineEvent[]>([]);
  const cornerTotalsRef = useRef<{ home: number; away: number } | null>(null);
  const signalTapeRef = useRef<HTMLOListElement | null>(null);


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
      stats: liveHint.stats ?? data.match.stats,
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
    setShowAllStats(false);
    setStatCornerBeeps([]);
    cornerTotalsRef.current = null;
  }, [matchId, periodTabs.length]);

  const activeStats = periodTabs[statTab]?.statistics ?? data?.statistics ?? [];

  const pulse = useMemo(() => {
    if (!match) return null;
    return buildLivePulse({
      status: match.status,
      elapsed: match.elapsed,
      homeName: match.home.name,
      awayName: match.away.name,
      goalsHome: match.goals.home ?? 0,
      goalsAway: match.goals.away ?? 0,
      rows: activeStats,
      fallbackPoss:
        match.stats?.possessionHome != null && match.stats.possessionAway != null
          ? { home: match.stats.possessionHome, away: match.stats.possessionAway }
          : null,
      fallbackCorners:
        match.stats?.cornersHome != null && match.stats.cornersAway != null
          ? { home: match.stats.cornersHome, away: match.stats.cornersAway }
          : null,
    });
  }, [match, activeStats]);

  const pressure = useAttackPressure({
    matchId,
    status: match?.status ?? '',
    rows: activeStats,
  });

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.debug('[pressure]', {
      supported: pressure.supported,
      found: pressure.found,
      rows: activeStats.map((r) => r.type),
    });
  }, [pressure.supported, pressure.found, activeStats]);

  // When live corner totals rise and the incidents feed missed them, beep into signals.
  useEffect(() => {
    if (!match || !pulse?.live || !pulse.key.corners) return;
    const next = pulse.key.corners;
    const prev = cornerTotalsRef.current;
    cornerTotalsRef.current = next;
    if (!prev) return;
    const minute = match.elapsed ?? null;
    const beeps: MatchTimelineEvent[] = [];
    if (next.home > prev.home) {
      for (let i = prev.home; i < next.home; i++) {
        beeps.push({
          time: minute,
          extra: null,
          type: 'Corner',
          detail: 'Corner Kick',
          teamId: match.home.id,
          teamName: match.home.name,
          player: null,
          assist: null,
        });
      }
    }
    if (next.away > prev.away) {
      for (let i = prev.away; i < next.away; i++) {
        beeps.push({
          time: minute,
          extra: null,
          type: 'Corner',
          detail: 'Corner Kick',
          teamId: match.away.id,
          teamName: match.away.name,
          player: null,
          assist: null,
        });
      }
    }
    if (beeps.length) {
      setStatCornerBeeps((cur) => [...cur, ...beeps].slice(-12));
    }
  }, [match, pulse?.live, pulse?.key.corners]);

  const signalEvents = useMemo(() => {
    const feed = data?.events ?? [];
    const merged = [...feed, ...statCornerBeeps];
    const seen = new Set<string>();
    const out: MatchTimelineEvent[] = [];
    for (const ev of merged) {
      const key = `${ev.time}|${ev.extra}|${ev.type}|${ev.detail}|${ev.teamName}|${ev.player}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(ev);
    }
    out.sort((a, b) => (a.time ?? 0) - (b.time ?? 0) || (a.extra ?? 0) - (b.extra ?? 0));
    return out;
  }, [data?.events, statCornerBeeps]);

  useEffect(() => {
    const el = signalTapeRef.current;
    if (!el) return;
    el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
  }, [signalEvents.length]);

  const featured = useMemo(
    () => (pulse ? featuredStatRows(activeStats, pulse.key) : []),
    [activeStats, pulse],
  );

  const extraStats = useMemo(() => {
    const featuredTypes = new Set(featured.map((f) => f.type.toLowerCase()));
    return activeStats.filter((row) => {
      const key = row.type.toLowerCase();
      if ([...featuredTypes].some((f) => key === f.toLowerCase() || key.includes(f.toLowerCase()))) {
        return false;
      }
      return true;
    });
  }, [activeStats, featured]);

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
            <div className="detail-hero__meta eyebrow">
              <span>{match.league}</span>
              {match.country ? <span>· {match.country}</span> : null}
              {data?.round ? <span>· {data.round}</span> : null}
            </div>

            <div className="detail-hero__scoreboard">
              <div className="detail-hero__team">
                {match.home.logo ? (
                  <img src={match.home.logo} alt="" />
                ) : (
                  <span className="crest crest--fallback num">{match.home.name.slice(0, 3)}</span>
                )}
                <strong>{match.home.name}</strong>
              </div>
              <div className="detail-hero__score">
                <span className="num">
                  {match.goals.home ?? 0}
                  <i>–</i>
                  {match.goals.away ?? 0}
                </span>
                <em className="num">
                  {match.elapsed != null &&
                  ['1H', '2H', 'ET', 'BT', 'P', 'LIVE'].includes(match.status) ? (
                    <>
                      <span className="live-dot" aria-hidden />
                      {`${match.elapsed}'`}
                    </>
                  ) : (
                    match.status
                  )}
                </em>
              </div>
              <div className="detail-hero__team detail-hero__team--away">
                {match.away.logo ? (
                  <img src={match.away.logo} alt="" />
                ) : (
                  <span className="crest crest--fallback num">{match.away.name.slice(0, 3)}</span>
                )}
                <strong>{match.away.name}</strong>
              </div>
            </div>

            <div className="detail-hero__actions">
              <button
                type="button"
                className={`btn ${favorited ? 'btn--primary' : 'btn--ghost'}`}
                aria-pressed={favorited}
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

          {pulse?.live && pressure.supported ? (
            <div style={{ marginBottom: '0.9rem' }}>
              <AttackPitch
                frame={pressure.current}
                history={pressure.frames}
                homeName={match.home.name}
                awayName={match.away.name}
                live={Boolean(pulse.live)}
              />
            </div>
          ) : null}

          {pulse?.live ? (
            <section
              className={pulseStyles.root}
              aria-label={t('timeline')}
              style={{
                display: 'block',
                width: '100%',
                maxWidth: '100%',
                boxSizing: 'border-box',
                margin: '0 0 1rem',
                paddingTop: '0.75rem',
                paddingBottom: '0.65rem',
              }}
            >
              <p className={pulseStyles.signalsHead} style={{ marginTop: 0, border: 'none', paddingTop: 0 }}>
                {t('timeline')}
              </p>
              {!signalEvents.length ? (
                <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
                  {t('noEvents')}
                </p>
              ) : (
                <ol
                  className={pulseStyles.eventFeed}
                  aria-label={t('timeline')}
                  ref={signalTapeRef}
                  style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}
                >
                  {signalEvents.map((ev, idx) => (
                    <li
                      key={`pulse-ev-${ev.time}-${ev.type}-${ev.teamName}-${ev.player}-${idx}`}
                      className={`${pulseStyles.eventChip} ${eventRowClass(ev)}`}
                      title={[ev.detail, ev.teamName, ev.player].filter(Boolean).join(' · ')}
                    >
                      <span className={`num ${pulseStyles.eventMin}`}>{eventMinute(ev)}</span>
                      <span className={pulseStyles.eventEmoji} aria-hidden>
                        {eventEmoji(ev)}
                      </span>
                      <span className={pulseStyles.eventLabel}>
                        {ev.player ?? ev.detail ?? ev.type}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ) : null}

          <AdSlot format="banner" className="ad-slot--feed" />

          {error ? <p className="settings__msg">{error}</p> : null}

          <section className="detail-panel match-stats">
            <div className="match-stats__head">
              <h2>{t('statsLive')}</h2>
              {periodTabs.length > 1 ? (
                <div className="stat-tabs" role="tablist" aria-label={t('stats')}>
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
            </div>

            {!featured.length && !activeStats.length ? (
              <p className="muted">{t('noStats')}</p>
            ) : (
              <>
                <ul className={meterStyles.list}>
                  {featured.map((row) => (
                    <DualMeter
                      key={row.type}
                      label={row.type}
                      home={row.home}
                      away={row.away}
                      kind={row.kind}
                    />
                  ))}
                </ul>

                {extraStats.length > 0 ? (
                  <div className="match-stats__more">
                    <button
                      type="button"
                      className="btn btn--ghost btn--compact"
                      aria-expanded={showAllStats}
                      onClick={() => setShowAllStats((v) => !v)}
                    >
                      {showAllStats ? t('statsHideMore') : t('statsShowMore', { n: extraStats.length })}
                    </button>
                    {showAllStats ? (
                      <ul className={meterStyles.listMore}>
                        {extraStats.map((row, idx) => {
                          const home = Number(String(row.home ?? '').replace('%', ''));
                          const away = Number(String(row.away ?? '').replace('%', ''));
                          if (!Number.isFinite(home) || !Number.isFinite(away)) {
                            return (
                              <li key={`${row.type}-${idx}`} className={meterStyles.row}>
                                <div className={meterStyles.top}>
                                  <strong>{formatStat(row.home)}</strong>
                                  <span>{row.type}</span>
                                  <strong>{formatStat(row.away)}</strong>
                                </div>
                              </li>
                            );
                          }
                          return (
                            <DualMeter
                              key={`${row.type}-${idx}`}
                              label={row.type}
                              home={home}
                              away={away}
                              kind={String(row.home).includes('%') ? 'percent' : 'count'}
                            />
                          );
                        })}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </section>

          <div className="detail-grid detail-grid--solo">
            <section className="detail-panel">
              <h2>{t('lineups')}</h2>
              {!data?.lineups.length ? (
                <p className="muted">{t('noLineups')}</p>
              ) : (
                <div className="lineups">
                  {data.lineups.map((lineup) => (
                    <div key={lineup.teamId} className="lineup">
                      <header>
                        {lineup.teamLogo ? (
                          <img src={lineup.teamLogo} alt="" width={22} height={22} />
                        ) : null}
                        <strong>{lineup.teamName}</strong>
                        <span>{lineup.formation ?? 'Formation TBA'}</span>
                      </header>
                      {lineup.coach ? <p className="muted">Coach: {lineup.coach}</p> : null}
                      <h3>XI</h3>
                      <ul>
                        {lineup.startXI.map((p) => (
                          <li key={`${lineup.teamId}-xi-${p.number}-${p.name}`}>
                            <span className="num">{p.number ?? '—'}</span>
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
                                <span className="num">{p.number ?? '—'}</span>
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
          </div>
        </>
      ) : null}
    </section>
  );
}

function formatStat(value: string | number | null): string {
  if (value == null) return '—';
  return String(value);
}

/** Timeline / pulse event emoji: goal ⚽ · pen 🟢 · yellow 🟨 · red 🟥 · sub 🔄 · corner 🚩 */
function eventEmoji(ev: MatchTimelineEvent): string {
  const type = (ev.type || '').toLowerCase();
  const detail = (ev.detail || '').toLowerCase();

  const isPen =
    detail.includes('penalty') ||
    detail.includes('pen.') ||
    /\bpen\b/.test(detail) ||
    detail.includes('spot kick');

  if (type === 'corner' || detail.includes('corner')) return '🚩';
  if (type === 'goal' || detail.includes('normal goal') || detail.includes('own goal')) {
    if (isPen) return '🟢';
    return '⚽';
  }
  if (isPen && (detail.includes('awarded') || detail.includes('confirmed'))) return '🟢';
  if (type === 'card' || detail.includes('card')) {
    if (detail.includes('red') || detail.includes('second yellow')) return '🟥';
    return '🟨';
  }
  if (type === 'subst' || type === 'substitution' || detail.includes('substitution')) return '🔄';
  if (detail.includes('var')) return '📺';
  return '•';
}

function eventKindClass(ev: MatchTimelineEvent): 'goal' | 'pen' | 'yellow' | 'red' | 'sub' | 'corner' | 'other' {
  const emoji = eventEmoji(ev);
  if (emoji === '⚽') return 'goal';
  if (emoji === '🟢') return 'pen';
  if (emoji === '🟨') return 'yellow';
  if (emoji === '🟥') return 'red';
  if (emoji === '🔄') return 'sub';
  if (emoji === '🚩') return 'corner';
  return 'other';
}

function eventRowClass(ev: MatchTimelineEvent): string {
  switch (eventKindClass(ev)) {
    case 'goal':
      return pulseStyles.event_goal;
    case 'pen':
      return pulseStyles.event_pen;
    case 'yellow':
      return pulseStyles.event_yellow;
    case 'red':
      return pulseStyles.event_red;
    case 'sub':
      return pulseStyles.event_sub;
    case 'corner':
      return pulseStyles.event_corner;
    default:
      return pulseStyles.event_other;
  }
}

function eventMinute(ev: MatchTimelineEvent): string {
  if (ev.time == null) return '—';
  return `${ev.time}${ev.extra ? `+${ev.extra}` : ''}'`;
}
