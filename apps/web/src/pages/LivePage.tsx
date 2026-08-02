import { useMemo, useState } from 'react';
import { AdSlot } from '../components/AdSlot';
import { MatchCard } from '../components/MatchCard';
import { useI18n } from '../i18n/I18nProvider';
import {
  groupMatchesByLeaguePopular,
  sortMatchesEndingSoon,
  type LiveSortMode,
} from '../lib/leagues';
import type { LiveMatch } from '../types';

const SORT_KEY = 'vamoos:live-sort';
const SORT_KEY_LEGACY = 'tg3d:live-sort';

const LIVE_STATUSES = new Set(['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE']);

interface LivePageProps {
  matches: LiveMatch[];
  mode: string;
  isFav: (id: number) => boolean;
  onToggle: (id: number) => void;
  pulseId?: number | null;
}

function readSort(): LiveSortMode {
  try {
    const v = localStorage.getItem(SORT_KEY) ?? localStorage.getItem(SORT_KEY_LEGACY);
    return v === 'ending' ? 'ending' : 'popular';
  } catch {
    return 'popular';
  }
}

function isInPlay(match: LiveMatch): boolean {
  return LIVE_STATUSES.has(match.status);
}

export function LivePage({ matches, mode, isFav, onToggle, pulseId }: LivePageProps) {
  const { t } = useI18n();
  const [sort, setSort] = useState<LiveSortMode>(() => readSort());

  const liveMatches = useMemo(() => matches.filter(isInPlay), [matches]);
  const grouped = useMemo(() => groupMatchesByLeaguePopular(liveMatches), [liveMatches]);
  const endingList = useMemo(() => sortMatchesEndingSoon(liveMatches), [liveMatches]);

  const setSortMode = (next: LiveSortMode) => {
    setSort(next);
    localStorage.setItem(SORT_KEY, next);
  };

  return (
    <section className="page">
      <div className="sort-bar" role="group" aria-label={t('sortAria')}>
        <button
          type="button"
          className={`sort-bar__btn${sort === 'popular' ? ' sort-bar__btn--on' : ''}`}
          onClick={() => setSortMode('popular')}
        >
          {t('sortPopular')}
        </button>
        <button
          type="button"
          className={`sort-bar__btn${sort === 'ending' ? ' sort-bar__btn--on' : ''}`}
          onClick={() => setSortMode('ending')}
        >
          {t('sortEnding')}
        </button>
      </div>

      {mode === 'demo' ? <p className="section-label">{t('liveDemo')}</p> : null}

      {!liveMatches.length ? (
        <div className="empty">
          <i className="ti ti-ball-football" aria-hidden />
          <p>{mode === 'connecting' ? t('connecting') : t('noLive')}</p>
        </div>
      ) : sort === 'ending' ? (
        <div className="match-list">
          <p className="section-label">{t('sortEnding')}</p>
          {endingList.map((m, i) => (
            <div key={m.id}>
              <MatchCard
                match={m}
                favorited={isFav(m.id)}
                onToggleFavorite={onToggle}
                highlight={pulseId === m.id}
                hideLeague={false}
              />
              {i === 2 ? <AdSlot format="infeed" className="ad-slot--feed" /> : null}
            </div>
          ))}
        </div>
      ) : (
        grouped.map((block, bi) => (
          <section key={block.leagueId ?? block.league} className="league-block">
            <p className="section-label">
              {block.logo ? (
                <img src={block.logo} alt="" className="league-crest" width={14} height={14} />
              ) : null}
              {block.league}
              {block.country ? <em className="league-country">{block.country}</em> : null}
            </p>
            <div className="match-list">
              {block.matches.map((m) => (
                <MatchCard
                  key={m.id}
                  match={m}
                  favorited={isFav(m.id)}
                  onToggleFavorite={onToggle}
                  highlight={pulseId === m.id}
                />
              ))}
            </div>
            {bi === 0 ? <AdSlot format="infeed" className="ad-slot--feed" /> : null}
          </section>
        ))
      )}
    </section>
  );
}
