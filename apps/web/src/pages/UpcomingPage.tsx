import { useEffect, useMemo, useState } from 'react';
import { MatchCard } from '../components/MatchCard';
import { useI18n } from '../i18n/I18nProvider';
import { apiUrl } from '../lib/apiBase';
import { groupMatchesByLeagueKickoff } from '../lib/leagues';
import type { LiveMatch } from '../types';

const UPCOMING_DAYS = 4;

interface UpcomingPageProps {
  isFav: (id: number) => boolean;
  onToggle: (id: number) => void;
}

interface FixturesDay {
  dayOffset: number;
  matches: LiveMatch[];
}

function dayLabel(
  offset: number,
  lang: string,
  t: (k: 'dayToday' | 'dayTomorrow') => string,
): string {
  if (offset === 0) return t('dayToday');
  if (offset === 1) return t('dayTomorrow');
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString(lang === 'ar' ? 'ar' : 'en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function UpcomingPage({ isFav, onToggle }: UpcomingPageProps) {
  const { t, lang } = useI18n();
  const [dayOffset, setDayOffset] = useState(0);
  const [fixtureDays, setFixtureDays] = useState<FixturesDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const activeUpcoming = useMemo(() => {
    const day = fixtureDays.find((d) => d.dayOffset === dayOffset);
    return day?.matches ?? [];
  }, [fixtureDays, dayOffset]);

  const upcomingGrouped = useMemo(
    () => groupMatchesByLeagueKickoff(activeUpcoming),
    [activeUpcoming],
  );

  useEffect(() => {
    let cancelled = false;
    const load = async (soft = false) => {
      if (!soft) {
        setLoading(true);
        setError(false);
      }
      try {
        const res = await fetch(apiUrl(`/api/fixtures?days=${UPCOMING_DAYS}`), {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`fixtures ${res.status}`);
        const data = (await res.json()) as { days?: FixturesDay[] };
        if (!cancelled) {
          setFixtureDays(Array.isArray(data.days) ? data.days : []);
          setError(false);
        }
      } catch {
        if (!cancelled && !soft) {
          setError(true);
          setFixtureDays([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load(false);
    const timer = window.setInterval(() => void load(true), 90_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <section className="page">
      <div className="page__intro">
        <h1>{t('upcomingTitle')}</h1>
        <p>{t('upcomingIntro')}</p>
      </div>

      <div className="day-bar" role="tablist" aria-label={t('upcomingDaysAria')}>
        {Array.from({ length: UPCOMING_DAYS }, (_, offset) => (
          <button
            key={offset}
            type="button"
            role="tab"
            aria-selected={dayOffset === offset}
            className={`day-bar__btn${dayOffset === offset ? ' day-bar__btn--on' : ''}`}
            onClick={() => setDayOffset(offset)}
          >
            {dayLabel(offset, lang, t)}
            <span className="day-bar__count">
              {fixtureDays.find((d) => d.dayOffset === offset)?.matches.length ?? '·'}
            </span>
          </button>
        ))}
      </div>

      {loading && !fixtureDays.length ? (
        <p className="empty">{t('upcomingLoading')}</p>
      ) : error && !fixtureDays.length ? (
        <p className="empty">{t('upcomingError')}</p>
      ) : !activeUpcoming.length ? (
        <p className="empty">{t('noUpcoming')}</p>
      ) : (
        upcomingGrouped.map((block) => (
          <section key={block.key} className="league-block league-block--upcoming">
            <h2>
              {block.logo ? (
                <img src={block.logo} alt="" className="league-crest" width={18} height={18} />
              ) : null}
              {block.name}
              {block.country ? <em className="league-country">{block.country}</em> : null}
            </h2>
            <div className="match-list">
              {block.matches.map((m) => (
                <MatchCard
                  key={m.id}
                  match={m}
                  favorited={isFav(m.id)}
                  onToggleFavorite={onToggle}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </section>
  );
}
