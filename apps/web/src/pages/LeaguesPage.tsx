import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdSlot } from '../components/AdSlot';
import { MatchCard } from '../components/MatchCard';
import { useI18n } from '../i18n/I18nProvider';
import { buildLeagueSummaries } from '../lib/leagues';
import type { LiveMatch } from '../types';

interface LeaguesPageProps {
  matches: LiveMatch[];
  isFav: (id: number) => boolean;
  onToggle: (id: number) => void;
  pulseId?: number | null;
}

export function LeaguesPage({ matches, isFav, onToggle, pulseId }: LeaguesPageProps) {
  const { t } = useI18n();
  const leagues = useMemo(() => buildLeagueSummaries(matches), [matches]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [query, setQuery] = useState('');

  const filteredLeagues = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return leagues;
    return leagues.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        (l.country?.toLowerCase().includes(q) ?? false),
    );
  }, [leagues, query]);

  const selected = selectedId == null ? null : leagues.find((l) => l.id === selectedId) ?? null;
  const selectedMatches = selected
    ? matches.filter((m) =>
        m.leagueId != null ? m.leagueId === selected.id : m.league === selected.name,
      )
    : [];

  return (
    <section className="page">
      <div className="page__intro">
        <h1>{t('leaguesTitle')}</h1>
        <p>{t('leaguesIntro')}</p>
      </div>

      <label className="league-search">
        <span className="sr-only">{t('leaguesSearch')}</span>
        <input
          type="search"
          placeholder={t('leaguesSearch')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      <AdSlot format="banner" className="ad-slot--feed" />

      {selected ? (
        <div className="league-detail">
          <button type="button" className="back-link" onClick={() => setSelectedId(null)}>
            {t('backLive').replace(/[←→]\s*/, '')} · {t('leaguesTitle')}
          </button>
          <h2 className="league-detail__title">
            {selected.logo ? <img src={selected.logo} alt="" width={28} height={28} /> : null}
            {selected.name}
            {selected.country ? <span className="league-country">{selected.country}</span> : null}
          </h2>
          {!selectedMatches.length ? (
            <p className="empty">{t('noLeagueMatches')}</p>
          ) : (
            <div className="match-list">
              {selectedMatches.map((m) => (
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
        </div>
      ) : !filteredLeagues.length ? (
        <div className="empty-panel">
          <p>{query.trim() ? t('leaguesNoMatch') : t('leaguesEmpty')}</p>
          <p>
            {t('leaguesBack')} <Link to="/">{t('navLive')}</Link> {t('leaguesWhenLive')}
          </p>
        </div>
      ) : (
        <ul className="league-index">
          {filteredLeagues.map((league) => (
            <li key={league.id}>
              <button
                type="button"
                className="league-index__row"
                onClick={() => setSelectedId(league.id)}
              >
                <span className="league-index__left">
                  {league.logo ? (
                    <img src={league.logo} alt="" width={26} height={26} />
                  ) : (
                    <span className="crest crest--fallback" />
                  )}
                  <span>
                    <strong>{league.name}</strong>
                    {league.country ? <em>{league.country}</em> : null}
                  </span>
                </span>
                <span className="league-index__count">
                  {t('matchesCount', { n: league.liveCount })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
