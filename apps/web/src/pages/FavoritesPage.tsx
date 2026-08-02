import { Link } from 'react-router-dom';
import { AdSlot } from '../components/AdSlot';
import { MatchCard } from '../components/MatchCard';
import { useI18n } from '../i18n/I18nProvider';
import type { LiveMatch } from '../types';

interface FavoritesPageProps {
  matches: LiveMatch[];
  favoriteIds: number[];
  isFav: (id: number) => boolean;
  onToggle: (id: number) => void;
  pulseId?: number | null;
}

export function FavoritesPage({
  matches,
  favoriteIds,
  isFav,
  onToggle,
  pulseId,
}: FavoritesPageProps) {
  const { t } = useI18n();
  const favMatches = matches.filter((m) => favoriteIds.includes(m.id));
  const missing = favoriteIds.filter((id) => !matches.some((m) => m.id === id));

  return (
    <section className="page">
      <div className="page__intro">
        <h1>{t('favTitle')}</h1>
        <p>{t('favIntro')}</p>
      </div>

      <AdSlot format="banner" className="ad-slot--feed" />

      {!favoriteIds.length ? (
        <div className="empty-panel empty-panel--icon">
          <span className="empty-panel__icon" aria-hidden>
            ★
          </span>
          <p>{t('favNone')}</p>
          <p className="muted">
            {t('favGoLive')} <Link to="/">{t('navLive')}</Link> {t('favStarHint')}
          </p>
        </div>
      ) : !favMatches.length ? (
        <div className="empty-panel empty-panel--icon">
          <span className="empty-panel__icon" aria-hidden>
            ◷
          </span>
          <p>{t('favNotLive')}</p>
          {missing.length > 0 && (
            <p className="muted">{t('favWaiting', { n: missing.length })}</p>
          )}
        </div>
      ) : (
        <div className="match-list">
          {favMatches.map((m) => (
            <MatchCard
              key={m.id}
              match={m}
              favorited={isFav(m.id)}
              onToggleFavorite={() => onToggle(m.id)}
              highlight={pulseId === m.id}
            />
          ))}
        </div>
      )}
    </section>
  );
}
