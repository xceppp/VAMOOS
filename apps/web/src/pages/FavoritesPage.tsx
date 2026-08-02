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
      <p className="section-label">{t('favTitle')}</p>

      <AdSlot format="banner" className="ad-slot--feed" />

      {!favoriteIds.length ? (
        <div className="empty">
          <i className="ti ti-star" aria-hidden />
          <p>{t('favEmptyHint')}</p>
        </div>
      ) : !favMatches.length ? (
        <div className="empty">
          <i className="ti ti-clock" aria-hidden />
          <p>{t('favNotLive')}</p>
          {missing.length > 0 ? (
            <p className="muted">{t('favWaiting', { n: missing.length })}</p>
          ) : null}
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
              hideLeague={false}
            />
          ))}
        </div>
      )}
    </section>
  );
}
