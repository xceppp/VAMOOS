import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider';
import type { LiveMatch } from '../types';

interface MatchCardProps {
  match: LiveMatch;
  favorited: boolean;
  onToggleFavorite: () => void;
  highlight?: boolean;
}

function TeamCrest({ logo, size = 22 }: { logo?: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (!logo || broken) return <span className="crest crest--fallback" />;
  return (
    <img
      src={logo}
      alt=""
      className="crest"
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
    />
  );
}

function fmtOdd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toFixed(2);
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

export function MatchCard({ match, favorited, onToggleFavorite, highlight }: MatchCardProps) {
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const isUpcoming = match.status === 'NS';
  const home = match.goals.home ?? 0;
  const away = match.goals.away ?? 0;
  const showClock =
    !isUpcoming &&
    match.elapsed != null &&
    ['1H', '2H', 'ET', 'BT', 'P', 'LIVE'].includes(match.status);
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
      className={`match-card match-card--clickable${highlight ? ' match-card--pulse' : ''}${hasSideStats || hasOdds ? ' match-card--rich' : ''}${isUpcoming ? ' match-card--upcoming' : ''}`}
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
      <span className="match-card__league">{match.league}</span>

      <div className="match-card__row">
        <div className="match-card__body">
          <div className="match-card__side">
            <TeamCrest logo={match.home.logo} />
            {hasSideStats && (
              <span className="side-stats" aria-label="Home possession and corners">
                {stats?.possessionHome != null && (
                  <span className="side-stats__poss">{stats.possessionHome}%</span>
                )}
                {stats?.cornersHome != null && (
                  <span className="side-stats__corner">
                    <img className="side-stats__corner-icon" src="/corner.png" alt="" width={12} height={12} />
                    {stats.cornersHome}
                  </span>
                )}
              </span>
            )}
            <span className="team-name">{match.home.name}</span>
          </div>

          <div className="match-card__score">
            {isUpcoming ? (
              <>
                <span className="kickoff-time">{formatKickoff(match.kickoff, lang)}</span>
                <div className="status-pill status-pill--ko">{t('kickoffShort')}</div>
              </>
            ) : (
              <>
                <span className="score-num">{home}</span>
                <span className="score-sep">–</span>
                <span className="score-num">{away}</span>
                <div className={`status-pill${showClock ? ' status-pill--live' : ''}`}>
                  {showClock ? `${match.elapsed}'` : match.status}
                </div>
                {hasOdds && (
                  <div className="match-odds" aria-label="Live 1X2 odds">
                    <span className="match-odds__cell">
                      <em>1</em>
                      {fmtOdd(odds?.home)}
                    </span>
                    <span className="match-odds__cell">
                      <em>X</em>
                      {fmtOdd(odds?.draw)}
                    </span>
                    <span className="match-odds__cell">
                      <em>2</em>
                      {fmtOdd(odds?.away)}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="match-card__side match-card__side--away">
            <span className="team-name">{match.away.name}</span>
            {hasSideStats && (
              <span className="side-stats side-stats--away" aria-label="Away possession and corners">
                {stats?.possessionAway != null && (
                  <span className="side-stats__poss">{stats.possessionAway}%</span>
                )}
                {stats?.cornersAway != null && (
                  <span className="side-stats__corner">
                    <img className="side-stats__corner-icon" src="/corner.png" alt="" width={12} height={12} />
                    {stats.cornersAway}
                  </span>
                )}
              </span>
            )}
            <TeamCrest logo={match.away.logo} />
          </div>
        </div>

        <button
          type="button"
          className={`star-btn${favorited ? ' star-btn--on' : ''}`}
          aria-label={favorited ? 'Remove from favorites' : 'Add to favorites'}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
        >
          {favorited ? '★' : '☆'}
        </button>
      </div>
    </article>
  );
}
