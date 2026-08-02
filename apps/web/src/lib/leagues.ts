import type { LiveMatch } from '../types';
import { leaguePopularity, matchCrowdScore } from './popularity';

export interface LeagueSummary {
  id: number;
  name: string;
  country?: string;
  logo?: string;
  liveCount: number;
  popularity: number;
}

export function buildLeagueSummaries(matches: LiveMatch[]): LeagueSummary[] {
  const map = new Map<string, LeagueSummary>();

  for (const m of matches) {
    const key = m.leagueId != null ? `id:${m.leagueId}` : `name:${m.league}`;
    const existing = map.get(key);
    if (existing) {
      existing.liveCount += 1;
      existing.popularity = Math.max(existing.popularity, m.popularity ?? leaguePopularity(m.leagueId, m.league));
      continue;
    }
    map.set(key, {
      id: m.leagueId ?? hashName(m.league),
      name: m.league,
      country: m.country,
      logo: m.leagueLogo,
      liveCount: 1,
      popularity: m.popularity ?? leaguePopularity(m.leagueId, m.league),
    });
  }

  return [...map.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );
}

export type LiveSortMode = 'popular' | 'ending';

/** Higher = closer to the final whistle (still in play preferred over finished). */
export function endingSoonScore(match: LiveMatch): number {
  const elapsed = match.elapsed ?? 0;
  const status = match.status;

  if (status === 'PEN' || status === 'P') return 400 + elapsed;
  if (status === 'BT' || status === 'ET') return 300 + elapsed;
  if (status === '2H') return 200 + elapsed;
  if (status === 'HT') return 145;
  if (status === '1H' || status === 'LIVE') return 100 + elapsed;
  if (status === 'AET') return 50 + elapsed;
  if (status === 'FT' || status === 'AWD' || status === 'WO') return elapsed;
  return elapsed;
}

export function sortMatchesEndingSoon(matches: LiveMatch[]): LiveMatch[] {
  return [...matches].sort((a, b) => {
    const diff = endingSoonScore(b) - endingSoonScore(a);
    if (diff !== 0) return diff;
    return (b.elapsed ?? 0) - (a.elapsed ?? 0);
  });
}

export function groupMatchesByLeaguePopular(matches: LiveMatch[]): Array<{
  league: string;
  leagueId?: number;
  country?: string;
  logo?: string;
  matches: LiveMatch[];
}> {
  const groups = new Map<
    string,
    {
      league: string;
      leagueId?: number;
      country?: string;
      logo?: string;
      popularity: number;
      matches: LiveMatch[];
    }
  >();

  for (const m of matches) {
    const key = m.leagueId != null ? `id:${m.leagueId}` : `name:${m.league}`;
    const crowd = matchCrowdScore({
      leagueId: m.leagueId,
      league: m.league,
      homeName: m.home.name,
      awayName: m.away.name,
      popularity: m.popularity,
    });
    const g = groups.get(key);
    if (!g) {
      groups.set(key, {
        league: m.league,
        leagueId: m.leagueId,
        country: m.country,
        logo: m.leagueLogo,
        popularity: crowd,
        matches: [m],
      });
    } else {
      g.matches.push(m);
      g.popularity = Math.max(g.popularity, crowd);
    }
  }

  return [...groups.values()]
    .map((g) => ({
      ...g,
      matches: [...g.matches].sort(
        (a, b) =>
          matchCrowdScore({
            leagueId: b.leagueId,
            league: b.league,
            homeName: b.home.name,
            awayName: b.away.name,
            popularity: b.popularity,
          }) -
          matchCrowdScore({
            leagueId: a.leagueId,
            league: a.league,
            homeName: a.home.name,
            awayName: a.away.name,
            popularity: a.popularity,
          }),
      ),
    }))
    .sort((a, b) => b.popularity - a.popularity || a.league.localeCompare(b.league));
}

/** Group upcoming fixtures by league; matches inside sorted by kickoff. */
export function groupMatchesByLeagueKickoff(matches: LiveMatch[]): Array<{
  key: string;
  name: string;
  country?: string;
  logo?: string;
  matches: LiveMatch[];
}> {
  const groups = new Map<
    string,
    {
      key: string;
      name: string;
      country?: string;
      logo?: string;
      popularity: number;
      matches: LiveMatch[];
    }
  >();

  for (const m of matches) {
    const key = m.leagueId != null ? `id:${m.leagueId}` : `name:${m.league}`;
    const crowd = m.popularity ?? leaguePopularity(m.leagueId, m.league);
    const g = groups.get(key);
    if (!g) {
      groups.set(key, {
        key,
        name: m.league,
        country: m.country,
        logo: m.leagueLogo,
        popularity: crowd,
        matches: [m],
      });
    } else {
      g.matches.push(m);
      g.popularity = Math.max(g.popularity, crowd);
    }
  }

  return [...groups.values()]
    .map((g) => ({
      key: g.key,
      name: g.name,
      country: g.country,
      logo: g.logo,
      matches: [...g.matches].sort((a, b) => {
        const at = a.kickoff ? Date.parse(a.kickoff) : 0;
        const bt = b.kickoff ? Date.parse(b.kickoff) : 0;
        return at - bt;
      }),
    }))
    .sort((a, b) => {
      const ap = groups.get(a.key)?.popularity ?? 0;
      const bp = groups.get(b.key)?.popularity ?? 0;
      return bp - ap || a.name.localeCompare(b.name);
    });
}

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h);
}
