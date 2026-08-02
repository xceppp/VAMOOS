import { ApiFootballError } from './errors.js';
import { fetchMatchEvents, fetchMatchStats, periodsToRows, statsToRows, } from './liveFeed.js';
import { matchCrowdScore } from './popularity.js';
const API_BASE = 'https://v3.football.api-sports.io';
export async function fetchMatchDetail(apiKey, fixtureId) {
    const res = await fetch(`${API_BASE}/fixtures?id=${fixtureId}`, {
        headers: { 'x-apisports-key': apiKey },
    });
    if (res.status === 429) {
        throw new ApiFootballError('API-Football detail rate limit', {
            status: 429,
            rateLimited: true,
        });
    }
    if (!res.ok) {
        throw new ApiFootballError(`API-Football detail error ${res.status}`, {
            status: res.status,
            rateLimited: res.status === 429,
        });
    }
    const json = (await res.json());
    if (json.errors && typeof json.errors === 'object' && !Array.isArray(json.errors)) {
        const entries = Object.entries(json.errors);
        if (entries.length > 0) {
            const blob = JSON.stringify(json.errors);
            throw new ApiFootballError(`API-Football errors: ${blob}`, {
                rateLimited: /rate.?limit|request[s]?\s+limit|reached the request|upgrade your plan|too many/i.test(blob),
            });
        }
    }
    const row = json.response?.[0];
    if (!row)
        return null;
    const popularity = matchCrowdScore({
        leagueId: row.league.id,
        league: row.league.name,
        homeName: row.teams.home.name,
        awayName: row.teams.away.name,
    });
    const match = {
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
        goals: { home: row.goals.home, away: row.goals.away },
        status: row.fixture.status.short,
        elapsed: row.fixture.status.elapsed,
        kickoff: row.fixture.date,
    };
    const homeStats = row.statistics?.find((s) => s.team.id === row.teams.home.id)?.statistics ?? [];
    const awayStats = row.statistics?.find((s) => s.team.id === row.teams.away.id)?.statistics ?? [];
    const types = [...new Set([...homeStats.map((s) => s.type), ...awayStats.map((s) => s.type)])];
    const statistics = types.map((type) => ({
        type,
        home: homeStats.find((s) => s.type === type)?.value ?? null,
        away: awayStats.find((s) => s.type === type)?.value ?? null,
    }));
    const events = (row.events ?? []).map((e) => ({
        time: e.time.elapsed,
        extra: e.time.extra,
        type: e.type,
        detail: e.detail,
        teamId: e.team?.id ?? null,
        teamName: e.team?.name ?? '',
        player: e.player?.name ?? null,
        assist: e.assist?.name ?? null,
    }));
    const lineups = (row.lineups ?? []).map((l) => ({
        teamId: l.team.id,
        teamName: l.team.name,
        teamLogo: l.team.logo,
        formation: l.formation ?? null,
        coach: l.coach?.name ?? null,
        startXI: (l.startXI ?? []).map((p) => ({
            id: p.player.id,
            name: p.player.name,
            number: p.player.number,
            pos: p.player.pos,
            grid: p.player.grid,
        })),
        substitutes: (l.substitutes ?? []).map((p) => ({
            id: p.player.id,
            name: p.player.name,
            number: p.player.number,
            pos: p.player.pos,
            grid: p.player.grid,
        })),
    }));
    return {
        match,
        venue: row.fixture.venue?.name ?? undefined,
        city: row.fixture.venue?.city ?? undefined,
        referee: row.fixture.referee ?? undefined,
        round: row.league.round,
        events,
        statistics,
        lineups,
        mode: 'live',
    };
}
export function buildDemoMatchDetail(seed) {
    const homeGoals = seed.goals.home ?? 0;
    const awayGoals = seed.goals.away ?? 0;
    const events = [];
    let minute = 12;
    for (let i = 0; i < homeGoals; i++) {
        events.push({
            time: minute,
            extra: null,
            type: 'Goal',
            detail: 'Normal Goal',
            teamId: seed.home.id,
            teamName: seed.home.name,
            player: `${seed.home.name.split(' ')[0]} #${9 + i}`,
            assist: null,
        });
        minute += 17;
    }
    for (let i = 0; i < awayGoals; i++) {
        events.push({
            time: minute,
            extra: null,
            type: 'Goal',
            detail: 'Normal Goal',
            teamId: seed.away.id,
            teamName: seed.away.name,
            player: `${seed.away.name.split(' ')[0]} #${10 + i}`,
            assist: null,
        });
        minute += 14;
    }
    events.push({
        time: 33,
        extra: null,
        type: 'Card',
        detail: 'Yellow Card',
        teamId: seed.away.id,
        teamName: seed.away.name,
        player: 'Demo Player',
        assist: null,
    });
    return {
        match: seed,
        venue: 'Demo Stadium',
        city: 'Demo City',
        referee: 'Demo Ref',
        round: 'Demo Round',
        events: events.sort((a, b) => (a.time ?? 0) - (b.time ?? 0)),
        statistics: [
            { type: 'Shots on Goal', home: 4 + homeGoals, away: 3 + awayGoals },
            { type: 'Total Shots', home: 10 + homeGoals, away: 8 + awayGoals },
            { type: 'Ball Possession', home: '54%', away: '46%' },
            { type: 'Corner Kicks', home: 5, away: 3 },
            { type: 'Fouls', home: 9, away: 11 },
            { type: 'Yellow Cards', home: 1, away: 2 },
            { type: 'Pass Accuracy', home: '86%', away: '82%' },
        ],
        lineups: [
            {
                teamId: seed.home.id,
                teamName: seed.home.name,
                teamLogo: seed.home.logo,
                formation: '4-3-3',
                coach: 'Home Coach',
                startXI: demoXI(seed.home.name),
                substitutes: demoBench(seed.home.name),
            },
            {
                teamId: seed.away.id,
                teamName: seed.away.name,
                teamLogo: seed.away.logo,
                formation: '4-2-3-1',
                coach: 'Away Coach',
                startXI: demoXI(seed.away.name),
                substitutes: demoBench(seed.away.name),
            },
        ],
        mode: 'demo',
    };
}
function demoXI(team) {
    return Array.from({ length: 11 }, (_, i) => ({
        id: i + 1,
        name: `${team.split(' ')[0]} ${i + 1}`,
        number: i + 1,
        pos: i === 0 ? 'G' : i < 5 ? 'D' : i < 8 ? 'M' : 'F',
        grid: null,
    }));
}
function demoBench(team) {
    return Array.from({ length: 5 }, (_, i) => ({
        id: 20 + i,
        name: `${team.split(' ')[0]} Sub ${i + 1}`,
        number: 12 + i,
        pos: 'M',
        grid: null,
    }));
}
export async function buildLiveFeedMatchDetail(seed) {
    const providerId = seed.providerId;
    let statistics = [];
    let events = [];
    let statPeriods = [];
    if (providerId) {
        const [stats, feedEvents] = await Promise.all([
            fetchMatchStats(providerId),
            fetchMatchEvents(providerId),
        ]);
        if (stats) {
            statistics = statsToRows(stats).map((r) => ({
                type: r.type,
                home: r.home,
                away: r.away,
            }));
            statPeriods = periodsToRows(stats).map((p) => ({
                name: p.name,
                statistics: p.statistics.map((r) => ({
                    type: r.type,
                    home: r.home,
                    away: r.away,
                })),
            }));
        }
        events = feedEvents.map((ev) => ({
            time: ev.minute,
            extra: ev.extra,
            type: ev.type,
            detail: ev.detail,
            teamId: ev.teamSide === 'home' ? seed.home.id : ev.teamSide === 'away' ? seed.away.id : null,
            teamName: ev.teamSide === 'home'
                ? seed.home.name
                : ev.teamSide === 'away'
                    ? seed.away.name
                    : '',
            player: ev.player,
            assist: ev.assist,
        }));
    }
    return {
        match: {
            ...seed,
            popularity: seed.popularity ??
                matchCrowdScore({
                    league: seed.league,
                    homeName: seed.home.name,
                    awayName: seed.away.name,
                }),
        },
        events,
        statistics,
        statPeriods,
        lineups: [],
        mode: 'live',
    };
}
