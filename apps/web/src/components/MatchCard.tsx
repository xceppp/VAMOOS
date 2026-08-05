import { memo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider';
import type { LiveMatch } from '../types';
import { ChanceBar, probsFromOdds } from './ChanceBar';

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
        width={25}
        height={25}
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

function relativeKickoff(iso: string | undefined, t: ReturnType<typeof useI18n>['t']): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const mins = Math.round((d.getTime() - Date.now()) / 60_000);
  if (mins <= 0) return t('kickSoon');
  if (mins < 60) return t('kickSoon');
  if (mins < 48 * 60) return t('kickInHours', { n: Math.round(mins / 60) });
  return t('kickLater');
}

function isLiveStatus(status: string): boolean {
  return ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE'].includes(status);
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
  const chanceProbs = odds ? probsFromOdds(odds) : null;

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
      {!hideLeague ? (
        <p className="match-card__league eyebrow">{match.league}</p>
      ) : null}

      <div className="match-card__row">
        <div className="match-card__kick">
          {live ? (
            <span className="badge-live">
              <span className="live-dot" aria-hidden />
              <span className="num">{showClock ? `${match.elapsed}'` : match.status}</span>
            </span>
          ) : isUpcoming ? (
            <>
              <span className="num match-card__kick-time">{formatKickoff(match.kickoff, lang)}</span>
              <span className="match-card__kick-sub">{relativeKickoff(match.kickoff, t)}</span>
            </>
          ) : (
            <span className="match-card__status num">{match.status}</span>
          )}
        </div>

        <div className="match-card__face">
          <div className={`match-card__side match-card__side--home${homeLeads ? ' is-lead' : ''}`}>
            <TeamAvatar logo={match.home.logo} name={match.home.name} />
            <span className="team-name">{match.home.name}</span>
          </div>

          <div className="match-card__scoreline" aria-label={`${home}–${away}`}>
            <span className={`num score${homeLeads ? ' lead' : ''}`}>{isUpcoming ? '–' : home}</span>
            <span className="score-sep" aria-hidden>
              –
            </span>
            <span className={`num score${awayLeads ? ' lead' : ''}`}>{isUpcoming ? '–' : away}</span>
          </div>

          <div className={`match-card__side match-card__side--away${awayLeads ? ' is-lead' : ''}`}>
            <span className="team-name">{match.away.name}</span>
            <TeamAvatar logo={match.away.logo} name={match.away.name} />
          </div>
        </div>

        {chanceProbs ? (
          <div className="match-card__chance">
            <ChanceBar
              compact
              home={chanceProbs.home}
              draw={chanceProbs.draw}
              away={chanceProbs.away}
              odds={odds}
            />
          </div>
        ) : null}

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
          <i className={favorited ? 'ti ti-bell-filled' : 'ti ti-bell'} aria-hidden />
        </button>
      </div>

      {hasSideStats ? (
        <div className="match-card__stats num" aria-label={t('liveMatchStats')}>
          {stats?.possessionHome != null && stats?.possessionAway != null ? (
            <span>
              {stats.possessionHome}%–{stats.possessionAway}%
            </span>
          ) : null}
          {stats?.cornersHome != null && stats?.cornersAway != null ? (
            <span>
              {t('statCorner')} {stats.cornersHome}–{stats.cornersAway}
            </span>
          ) : null}
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
