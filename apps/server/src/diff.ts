import type { LiveMatch, MatchEvent } from './types.js';

export function diffMatches(
  prev: Map<number, LiveMatch>,
  next: LiveMatch[],
): MatchEvent[] {
  const events: MatchEvent[] = [];
  const at = new Date().toISOString();

  for (const match of next) {
    const old = prev.get(match.id);
    if (!old) {
      if (isLiveStatus(match.status) && match.elapsed != null && match.elapsed <= 2) {
        events.push({
          type: 'kickoff',
          matchId: match.id,
          match,
          message: `${match.home.name} vs ${match.away.name} kicked off`,
          at,
        });
      }
      continue;
    }

    const oldHome = old.goals.home ?? 0;
    const oldAway = old.goals.away ?? 0;
    const newHome = match.goals.home ?? 0;
    const newAway = match.goals.away ?? 0;

    if (newHome > oldHome) {
      events.push({
        type: 'goal',
        matchId: match.id,
        match,
        scorer: 'home',
        message: `GOAL! ${match.home.name} ${newHome}-${newAway} ${match.away.name}`,
        at,
      });
    } else if (newAway > oldAway) {
      events.push({
        type: 'goal',
        matchId: match.id,
        match,
        scorer: 'away',
        message: `GOAL! ${match.home.name} ${newHome}-${newAway} ${match.away.name}`,
        at,
      });
    } else if (newHome !== oldHome || newAway !== oldAway) {
      events.push({
        type: 'score',
        matchId: match.id,
        match,
        message: `Score update: ${match.home.name} ${newHome}-${newAway} ${match.away.name}`,
        at,
      });
    }

    if (!isFinished(old.status) && isFinished(match.status)) {
      events.push({
        type: 'fulltime',
        matchId: match.id,
        match,
        message: `FT ${match.home.name} ${newHome}-${newAway} ${match.away.name}`,
        at,
      });
    }

    if (!isLiveStatus(old.status) && isLiveStatus(match.status) && (old.status === 'NS' || old.status === 'PST')) {
      events.push({
        type: 'kickoff',
        matchId: match.id,
        match,
        message: `${match.home.name} vs ${match.away.name} kicked off`,
        at,
      });
    }
  }

  return events;
}

function isFinished(status: string): boolean {
  return ['FT', 'AET', 'PEN', 'AWD', 'WO', 'ABD', 'CANC'].includes(status);
}

function isLiveStatus(status: string): boolean {
  return ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE'].includes(status);
}

export function toMap(matches: LiveMatch[]): Map<number, LiveMatch> {
  return new Map(matches.map((m) => [m.id, m]));
}
