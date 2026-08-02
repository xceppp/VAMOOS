import { ApiFootballError } from './errors.js';
import { matchCrowdScore } from './popularity.js';
const API_BASE = 'https://v3.football.api-sports.io';
function mapFixtures(rows) {
    return rows
        .map((row) => {
        const popularity = matchCrowdScore({
            leagueId: row.league.id,
            league: row.league.name,
            homeName: row.teams.home.name,
            awayName: row.teams.away.name,
        });
        return {
            id: row.fixture.id,
            league: row.league.name,
            leagueId: row.league.id,
            leagueLogo: row.league.logo,
            country: row.league.country,
            popularity,
            home: {
                id: row.teams.home.id,
                name: row.teams.home.name,
                logo: row.teams.home.logo,
            },
            away: {
                id: row.teams.away.id,
                name: row.teams.away.name,
                logo: row.teams.away.logo,
            },
            goals: {
                home: row.goals.home,
                away: row.goals.away,
            },
            status: row.fixture.status.short,
            elapsed: row.fixture.status.elapsed,
            kickoff: row.fixture.date,
        };
    })
        .sort((a, b) => b.popularity - a.popularity || a.league.localeCompare(b.league));
}
export async function fetchLiveFixtures(apiKey) {
    const res = await fetch(`${API_BASE}/fixtures?live=all`, {
        headers: {
            'x-apisports-key': apiKey,
        },
    });
    if (res.status === 429) {
        throw new ApiFootballError('API-Football daily/minute rate limit hit', {
            status: 429,
            rateLimited: true,
        });
    }
    if (!res.ok) {
        const text = await res.text();
        throw new ApiFootballError(`API-Football error ${res.status}: ${text}`, {
            status: res.status,
            rateLimited: res.status === 429,
        });
    }
    const json = (await res.json());
    if (json.errors && typeof json.errors === 'object' && !Array.isArray(json.errors)) {
        const entries = Object.entries(json.errors);
        if (entries.length > 0) {
            const blob = JSON.stringify(json.errors);
            const rateLimited = /rate.?limit|request[s]?\s+limit|reached the request|upgrade your plan|too many/i.test(blob);
            throw new ApiFootballError(`API-Football errors: ${blob}`, {
                rateLimited,
            });
        }
    }
    return mapFixtures(json.response ?? []);
}
