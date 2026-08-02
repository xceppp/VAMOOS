import type { LiveMatch } from './types.js';
import { matchCrowdScore } from './popularity.js';

const CLUBS = [
  { id: 1, name: 'Arsenal' },
  { id: 2, name: 'Chelsea' },
  { id: 3, name: 'Liverpool' },
  { id: 4, name: 'Man City' },
  { id: 5, name: 'Man United' },
  { id: 6, name: 'Tottenham' },
  { id: 7, name: 'Barcelona' },
  { id: 8, name: 'Real Madrid' },
  { id: 9, name: 'Inter' },
  { id: 10, name: 'AC Milan' },
  { id: 11, name: 'Bayern' },
  { id: 12, name: 'Dortmund' },
];

const LEAGUES = [
  { id: 39, name: 'Premier League', country: 'England' },
  { id: 140, name: 'La Liga', country: 'Spain' },
  { id: 135, name: 'Serie A', country: 'Italy' },
  { id: 78, name: 'Bundesliga', country: 'Germany' },
];

function pair(i: number): LiveMatch {
  const home = CLUBS[i % CLUBS.length];
  const away = CLUBS[(i + 3) % CLUBS.length];
  const league = LEAGUES[i % LEAGUES.length];
  const elapsed = 12 + ((i * 7) % 70);
  const status = elapsed < 45 ? '1H' : elapsed < 48 ? 'HT' : '2H';
  const popularity = matchCrowdScore({
    leagueId: league.id,
    league: league.name,
    homeName: home.name,
    awayName: away.name,
  });
  return {
    id: 9000 + i,
    league: league.name,
    leagueId: league.id,
    country: league.country,
    popularity,
    home: { ...home },
    away: { ...away },
    goals: {
      home: Math.floor(i / 2) % 3,
      away: (i + 1) % 3,
    },
    status,
    elapsed,
    kickoff: new Date().toISOString(),
  };
}

let demoMatches: LiveMatch[] = [0, 1, 2, 3, 4, 5].map(pair);
let tick = 0;

export function getDemoMatches(): LiveMatch[] {
  return demoMatches.map((m) => ({
    ...m,
    home: { ...m.home },
    away: { ...m.away },
    goals: { ...m.goals },
  }));
}

/** Advance clock and occasionally score a goal for demo mode. */
export function tickDemoMatches(): { matches: LiveMatch[]; scored: LiveMatch | null } {
  tick += 1;
  let scored: LiveMatch | null = null;

  demoMatches = demoMatches.map((m, idx) => {
    const next = {
      ...m,
      home: { ...m.home },
      away: { ...m.away },
      goals: { ...m.goals },
      elapsed: Math.min(90, (m.elapsed ?? 0) + 1),
    };

    if (next.elapsed! < 45) next.status = '1H';
    else if (next.elapsed! < 47) next.status = 'HT';
    else if (next.elapsed! < 90) next.status = '2H';
    else next.status = 'FT';

    if (tick % 3 === 0 && idx === tick % demoMatches.length && next.status !== 'FT' && next.status !== 'HT') {
      const side = tick % 2 === 0 ? 'home' : 'away';
      next.goals[side] = (next.goals[side] ?? 0) + 1;
      scored = next;
    }

    return next;
  });

  return { matches: getDemoMatches(), scored };
}
