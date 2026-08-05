import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AdSlot } from '../components/AdSlot';
import { useI18n } from '../i18n/I18nProvider';
import { apiUrl } from '../lib/apiBase';
import {
  buildLivePulse,
  featuredStatRows,
  type PulseLevel,
  type PulseSignal,
} from '../lib/livePulse';
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

function pct(n: number): string {
  return `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`;
}

function signalText(
  signal: PulseSignal,
  t: ReturnType<typeof useI18n>['t'],
): string {
  const team = signal.teamName ?? '';
  switch (signal.labelKey) {
    case 'pulseHighAttack':
      return t('pulseHighAttack', { team });
    case 'pulsePressing':
      return team ? t('pulsePressingTeam', { team }) : t('pulsePressing');
    case 'pulseCornerStorm':
      return t('pulseCornerStorm');
    case 'pulseGoalThreat':
      return t('pulseGoalThreat');
    case 'pulseQuiet':
      return t('pulseQuiet');
    case 'pulseShotHeavy':
      return team ? t('pulseShotHeavyTeam', { team }) : t('pulseShotHeavy');
    case 'pulsePossDominant':
      return t('pulsePossDominant', { team });
    default:
      return '';
  }
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

          {pulse?.live ? (
            <section
              className={pulseStyles.root}
              aria-label={t('pulseTitle')}
              style={{
                display: 'block',
                width: '100%',
                maxWidth: '100%',
                height: 'auto',
                minHeight: 'auto',
                position: 'relative',
                boxSizing: 'border-box',
                margin: '0 0 1rem',
                padding: '1rem',
                overflow: 'visible',
                flex: 'none',
                alignItems: 'stretch',
                justifyContent: 'flex-start',
                flexDirection: 'column',
              }}
            >
              <div
                className={pulseStyles.head}
                style={{ display: 'block', width: '100%', margin: '0 0 0.85rem' }}
              >
                <h2
                  style={{
                    margin: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: '1.05rem',
                    fontWeight: 700,
                    lineHeight: 1.3,
                  }}
                >
                  <span className="live-dot" aria-hidden />
                  {t('pulseTitle')}
                </h2>
                <p
                  className={pulseStyles.sub}
                  style={{ display: 'block', margin: '0.25rem 0 0', fontSize: 12.5, lineHeight: 1.35 }}
                >
                  {t('pulseSub')}
                </p>
              </div>

              <div
                className={pulseStyles.gauges}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: 8,
                  width: '100%',
                  margin: '0 0 0.85rem',
                }}
              >
                <div
                  className={[
                    pulseStyles.gauge,
                    pulse.goalLevel === 'high' ? pulseStyles.gaugeHigh : '',
                    pulse.goalLevel === 'med' ? pulseStyles.gaugeMed : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{ minWidth: 0, textAlign: 'center', padding: '10px 8px' }}
                >
                  <span className={pulseStyles.label} style={{ display: 'block' }}>
                    {t('pulseGoalChance')}
                  </span>
                  <strong className={`num ${pulseStyles.value}`} style={{ display: 'block', fontSize: 22 }}>
                    {pct(pulse.pNextGoal)}
                  </strong>
                  <span className={pulseStyles.hint} style={{ display: 'block' }}>
                    {t('pulseLevel', { level: levelWord(pulse.goalLevel, t) })}
                  </span>
                </div>
                <div
                  className={[
                    pulseStyles.gauge,
                    pulse.cornerLevel === 'high' ? pulseStyles.gaugeHigh : '',
                    pulse.cornerLevel === 'med' ? pulseStyles.gaugeMed : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{ minWidth: 0, textAlign: 'center', padding: '10px 8px' }}
                >
                  <span className={pulseStyles.label} style={{ display: 'block' }}>
                    {t('pulseCornerChance')}
                  </span>
                  <strong className={`num ${pulseStyles.value}`} style={{ display: 'block', fontSize: 22 }}>
                    {pct(pulse.pNextCorner)}
                  </strong>
                  <span className={pulseStyles.hint} style={{ display: 'block' }}>
                    {t('pulseLevel', { level: levelWord(pulse.cornerLevel, t) })}
                  </span>
                </div>
                {(() => {
                  const intensityLevel = levelFromIntensity(pulse.intensity);
                  return (
                    <div
                      className={[
                        pulseStyles.gauge,
                        intensityLevel === 'high' ? pulseStyles.gaugeHigh : '',
                        intensityLevel === 'med' ? pulseStyles.gaugeMed : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={{ minWidth: 0, textAlign: 'center', padding: '10px 8px' }}
                    >
                      <span className={pulseStyles.label} style={{ display: 'block' }}>
                        {t('pulseIntensity')}
                      </span>
                      <strong className={`num ${pulseStyles.value}`} style={{ display: 'block', fontSize: 22 }}>
                        {Math.round(pulse.intensity * 100)}
                      </strong>
                      <span className={pulseStyles.hint} style={{ display: 'block' }}>
                        {t('pulseTempo')}
                      </span>
                    </div>
                  );
                })()}
              </div>

              <ul
                className={pulseStyles.signals}
                style={{
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  width: '100%',
                }}
              >
                {pulse.signals.map((s) => (
                  <li
                    key={s.id}
                    className={[
                      pulseStyles.signal,
                      s.level === 'high' ? pulseStyles.signalHigh : '',
                      s.level === 'med' ? pulseStyles.signalMed : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '9px 10px',
                    }}
                  >
                    <span className={pulseStyles.signalDot} aria-hidden />
                    <span className={pulseStyles.signalText} style={{ minWidth: 0, flex: 1 }}>
                      {signalText(s, t)}
                    </span>
                  </li>
                ))}
              </ul>
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

          <div className="detail-grid">
            <section className="detail-panel">
              <h2>{t('timeline')}</h2>
              {!data?.events.length ? (
                <p className="muted">{t('noEvents')}</p>
              ) : (
                <ol className="timeline">
                  {data.events.map((ev, idx) => (
                    <li key={`${ev.time}-${ev.type}-${ev.player}-${idx}`} className="timeline__item">
                      <span className="timeline__min num">
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

function levelWord(level: PulseLevel, t: ReturnType<typeof useI18n>['t']): string {
  if (level === 'high') return t('pulseHigh');
  if (level === 'med') return t('pulseMed');
  return t('pulseLow');
}

function levelFromIntensity(n: number): PulseLevel {
  if (n >= 0.65) return 'high';
  if (n >= 0.35) return 'med';
  return 'low';
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
