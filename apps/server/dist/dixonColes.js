/**
 * Dixon-Coles + Elo predictions board (live + upcoming).
 * Pure TypeScript engine — no Python on the host.
 */
import { fetchFootballFeed, fetchUpcomingFeedMatches, providerIdToNumber, } from './liveFeed.js';
import { matchCrowdScore } from './popularity.js';
import { runDixonBatch, } from './dixonEngine.js';
import { scanLiveHeat } from './liveHeatScan.js';
const CACHE_MS = 45_000;
let cache = null;
function isInPlay(m) {
    return m.status === 'LIVE' || m.status === 'HT' || m.status === 'ET' || m.statusCode === 2;
}
function riskFromConfidence(c) {
    if (c >= 0.58)
        return 'green';
    if (c >= 0.48)
        return 'orange';
    return 'red';
}
export function dixonRisk(p) {
    return riskFromConfidence(p.confidence);
}
export async function buildDixonBoard(opts) {
    const now = Date.now();
    if (!opts?.force && cache && now - cache.at < CACHE_MS) {
        return cache.data;
    }
    const liveFeed = await fetchFootballFeed();
    const liveMatches = liveFeed.filter(isInPlay);
    const upcomingPack = await fetchUpcomingFeedMatches((input) => matchCrowdScore({
        league: input.league,
        homeName: input.homeName,
        awayName: input.awayName,
    }), 2);
    const upcomingLive = [];
    for (const m of liveFeed) {
        if (m.status === 'NS')
            upcomingLive.push(m);
    }
    const payload = [];
    const bucketById = new Map();
    for (const m of liveMatches.slice(0, 60)) {
        const id = m.id;
        bucketById.set(id, 'live');
        payload.push({
            id,
            liveId: providerIdToNumber(m.id),
            home: m.home,
            away: m.away,
            homeLogo: m.homeLogo,
            awayLogo: m.awayLogo,
            league: m.league,
            kickoff: m.kickoffTs ? new Date(m.kickoffTs * 1000).toISOString() : null,
            status: m.status,
            minute: m.minute,
            score: `${m.homeGoals}-${m.awayGoals}`,
        });
    }
    for (const day of upcomingPack.days) {
        for (const m of day.matches.slice(0, 40)) {
            const id = m.providerId || String(m.id);
            if (bucketById.has(id))
                continue;
            bucketById.set(id, 'upcoming');
            payload.push({
                id,
                liveId: m.id,
                home: m.home.name,
                away: m.away.name,
                homeLogo: m.home.logo,
                awayLogo: m.away.logo,
                league: m.league,
                kickoff: m.kickoff ?? null,
                status: m.status,
                minute: null,
                score: null,
            });
        }
    }
    for (const m of upcomingLive.slice(0, 40)) {
        if (bucketById.has(m.id))
            continue;
        bucketById.set(m.id, 'upcoming');
        payload.push({
            id: m.id,
            liveId: providerIdToNumber(m.id),
            home: m.home,
            away: m.away,
            homeLogo: m.homeLogo,
            awayLogo: m.awayLogo,
            league: m.league,
            kickoff: m.kickoffTs ? new Date(m.kickoffTs * 1000).toISOString() : null,
            status: 'NS',
            minute: null,
            score: null,
        });
    }
    const batch = runDixonBatch(payload);
    const live = [];
    const upcoming = [];
    for (const r of batch.results) {
        const bucket = bucketById.get(r.id) ?? 'upcoming';
        const pick = { ...r, bucket };
        if (bucket === 'live')
            live.push(pick);
        else
            upcoming.push(pick);
    }
    live.sort((a, b) => b.heat - a.heat || b.confidence - a.confidence);
    upcoming.sort((a, b) => b.heat - a.heat || b.confidence - a.confidence);
    const heat = await scanLiveHeat({ force: opts?.force });
    let notice = null;
    if (batch.error) {
        notice = `Dixon-Coles engine unavailable (${batch.error})`;
    }
    else if (!live.length && !upcoming.length && !heat.corners.length && !heat.shots.length) {
        notice =
            batch.skipped.length > 0
                ? `No Dixon-Coles packs matched current fixtures (${batch.skipped.length} skipped). Covered: PL, La Liga, Serie A, Bundesliga, Ligue 1, MLS, Liga MX, UCL.`
                : 'No live or upcoming matches to score right now.';
    }
    const data = {
        at: new Date().toISOString(),
        model: 'dixon-coles-elo',
        live,
        upcoming,
        liveHeat: {
            corners: heat.corners,
            shots: heat.shots,
            scanned: heat.scanned,
            notice: heat.notice,
        },
        skipped: batch.skipped.length,
        notice: notice ?? heat.notice,
    };
    cache = { at: Date.now(), data };
    return data;
}
