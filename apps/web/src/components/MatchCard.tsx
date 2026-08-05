import { memo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider';
import type { LiveMatch } from '../types';

interface MatchCardProps {
  match: LiveMatch;
  favorited: boolean;
  /** Stable callback — receives match id so parent can pass useFavorites().toggle */
  onToggleFavorite: (matchId: number) => void;
  highlight?: boolean;
  predictionTag?: string;
  cardId?: string;
  /** Hide league label on the card when a section header already shows it. */
  hideLeague?: boolean;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

function TeamAvatar({ logo, name }: { logo?: string; name: string }) {
  const [broken, setBroken] = useState(false);
  if (logo && !broken) {
    return (
      <img
        src={logo}
        alt=""
        className="avatar avatar--img"
        width={28}
        height={28}
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
      />
    );
  }
  return <span className="avatar num">{initials(name)}</span>;
}

function formatKickoff(iso: string | undefined, lang: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(lang === 'ar' ? 'ar' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function isLiveStatus(status: string): boolean {
  return ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE'].includes(status);
}

function fmtOdd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toFixed(2);
}

function MatchCardInner({
  match,
  favorited,
  onToggleFavorite,
  highlight,
  predictionTag,
  cardId,
  hideLeague = true,
}: MatchCardProps) {
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const isUpcoming = match.status === 'NS';
  const home = match.goals.home ?? 0;
  const away = match.goals.away ?? 0;
  const live = !isUpcoming && isLiveStatus(match.status);
  const showClock =
    live && match.elapsed != null && ['1H', '2H', 'ET', 'BT', 'P', 'LIVE'].includes(match.status);
  const homeLeads = !isUpcoming && home > away;
  const awayLeads = !isUpcoming && away > home;
  const stats = match.stats;
  const odds = match.odds;
  const hasSideStats =
    !isUpcoming &&
    stats != null &&
    (stats.possessionHome != null ||
      stats.possessionAway != null ||
      stats.cornersHome != null ||
      stats.cornersAway != null);
  const hasOdds =
    !isUpcoming && odds != null && (odds.home != null || odds.draw != null || odds.away != null);

  return (
    <article
      id={cardId ?? `match-${match.id}`}
      className={[
        'match-card',
        'match-card--facing',
        'match-card--clickable',
        highlight ? 'match-card--pulse' : '',
        isUpcoming ? 'match-card--upcoming' : '',
        live ? 'match-card--live' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="link"
      tabIndex={0}
      onClick={() => navigate(`/match/${match.id}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(`/match/${match.id}`);
        }
      }}
    >
      <div className="match-card__head">
        <div className="match-card__head-left">
          {!hideLeague ? <span className="match-card__league">{match.league}</span> : null}
          {live ? (
            <span className="badge-live">
              <span className="live-dot" aria-hidden />
              <span className="num">{showClock ? `${match.elapsed}'` : match.status}</span>
            </span>
          ) : isUpcoming ? (
            <span className="match-card__status num">{formatKickoff(match.kickoff, lang)}</span>
          ) : (
            <span className="match-card__status num">{match.status}</span>
          )}
        </div>
        <button
          type="button"
          className={`star${favorited ? ' on' : ''}`}
          aria-label={favorited ? t('favorited') : t('addFavorite')}
          aria-pressed={favorited}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(match.id);
          }}
        >
          <i className={favorited ? 'ti ti-star-filled' : 'ti ti-star'} aria-hidden />
        </button>
      </div>

      <div className="match-card__face">
        <div className={`match-card__side match-card__side--home${homeLeads ? ' is-lead' : ''}`}>
          <TeamAvatar logo={match.home.logo} name={match.home.name} />
          <div className="match-card__side-text">
            <span className="team-name">{match.home.name}</span>
            {hasSideStats ? (
              <span className="match-card__chips">
                {stats?.possessionHome != null ? (
                  <span className="side-chip num">{stats.possessionHome}%</span>
                ) : null}
                {stats?.cornersHome != null ? (
                  <span className="side-chip side-chip--corner num">
                    <img src="/corner.png" alt="" width={10} height={10} />
                    {stats.cornersHome}
                  </span>
                ) : null}
              </span>
            ) : null}
          </div>
        </div>

        <div className="match-card__scoreline" aria-label={`${home}–${away}`}>
          <span className={`num score${homeLeads ? ' lead' : ''}`}>{isUpcoming ? '–' : home}</span>
          <span className="score-sep" aria-hidden>
            –
          </span>
          <span className={`num score${awayLeads ? ' lead' : ''}`}>{isUpcoming ? '–' : away}</span>
        </div>

        <div className={`match-card__side match-card__side--away${awayLeads ? ' is-lead' : ''}`}>
          <div className="match-card__side-text">
            <span className="team-name">{match.away.name}</span>
            {hasSideStats ? (
              <span className="match-card__chips">
                {stats?.possessionAway != null ? (
                  <span className="side-chip num">{stats.possessionAway}%</span>
                ) : null}
                {stats?.cornersAway != null ? (
                  <span className="side-chip side-chip--corner num">
                    <img src="/corner.png" alt="" width={10} height={10} />
                    {stats.cornersAway}
                  </span>
                ) : null}
              </span>
            ) : null}
          </div>
          <TeamAvatar logo={match.away.logo} name={match.away.name} />
        </div>
      </div>

      {hasOdds ? (
        <div className="match-odds match-odds--inline" aria-label="1X2">
          <span>
            <em>1</em>
            <span className="num">{fmtOdd(odds?.home)}</span>
          </span>
          <span>
            <em>X</em>
            <span className="num">{fmtOdd(odds?.draw)}</span>
          </span>
          <span>
            <em>2</em>
            <span className="num">{fmtOdd(odds?.away)}</span>
          </span>
        </div>
      ) : null}

      {predictionTag ? (
        <div className="pred-tag">
          <i className="ti ti-chart-bar" aria-hidden />
          <span>{predictionTag}</span>
        </div>
      ) : null}
    </article>
  );
}

function matchVisualEqual(a: LiveMatch, b: LiveMatch): boolean {
  if (a === b) return true;
  return (
    a.id === b.id &&
    a.status === b.status &&
    a.elapsed === b.elapsed &&
    a.goals.home === b.goals.home &&
    a.goals.away === b.goals.away &&
    a.home.name === b.home.name &&
    a.away.name === b.away.name &&
    a.home.logo === b.home.logo &&
    a.away.logo === b.away.logo &&
    a.league === b.league &&
    a.kickoff === b.kickoff &&
    a.stats?.possessionHome === b.stats?.possessionHome &&
    a.stats?.possessionAway === b.stats?.possessionAway &&
    a.stats?.cornersHome === b.stats?.cornersHome &&
    a.stats?.cornersAway === b.stats?.cornersAway &&
    a.odds?.home === b.odds?.home &&
    a.odds?.draw === b.odds?.draw &&
    a.odds?.away === b.odds?.away
  );
}

export const MatchCard = memo(function MatchCard(props: MatchCardProps) {
  return <MatchCardInner {...props} />;
}, (prev, next) => {
  return (
    matchVisualEqual(prev.match, next.match) &&
    prev.favorited === next.favorited &&
    prev.highlight === next.highlight &&
    prev.predictionTag === next.predictionTag &&
    prev.cardId === next.cardId &&
    prev.hideLeague === next.hideLeague &&
    prev.onToggleFavorite === next.onToggleFavorite
  );
});
