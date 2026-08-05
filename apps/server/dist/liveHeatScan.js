/**
 * Live Predictions heat: rank in-play matches by corners + chance of more,
 * and by shots on target + chance of scoring.
 */
import { fetchFootballFeed, fetchStatsForMatches, providerIdToNumber, } from './liveFeed.js';
import { analyzeGoalPotential } from './goalPotential.js';
const CACHE_MS = 20_000;
let cache = null;
function toParsed(match, stats) {
    return {
        url: match.url,
        matchId: match.id,
        slug: null,
        home: match.home,
        away: match.away,
        homeGoals: match.homeGoals,
        awayGoals: match.awayGoals,
        minute: match.minute,
        status: match.status,
        possessionHome: stats?.possessionHome ?? null,
        possessionAway: stats?.possessionAway ?? null,
        shotsOnHome: stats?.shotsOnHome ?? null,
        shotsOnAway: stats?.shotsOnAway ?? null,
        shotsOffHome: stats?.shotsOffHome ?? null,
        shotsOffAway: stats?.shotsOffAway ?? null,
        attacksHome: stats?.totalShotsHome ?? null,
        attacksAway: stats?.totalShotsAway ?? null,
        dangerousHome: null,
        dangerousAway: null,
        cornersHome: stats?.cornersHome ?? null,
        cornersAway: stats?.cornersAway ?? null,
        xgHome: stats?.xgHome ?? null,
        xgAway: stats?.xgAway ?? null,
        source: 'manual',
        notes: [],
    };
}
function isEligible(m) {
    if (m.status === 'FT' || m.status === 'NS')
        return false;
    if (m.status === 'HT' || m.status === 'ET')
        return true;
    if (m.status === 'LIVE' || m.statusCode === 2) {
        return m.minute == null || m.minute >= 15;
    }
    return false;
}
function toHeatPick(match, stats) {
    const analysis = analyzeGoalPotential(toParsed(match, stats));
    const cH = stats?.cornersHome ?? 0;
    const cA = stats?.cornersAway ?? 0;
    const sH = stats?.shotsOnHome ?? 0;
    const sA = stats?.shotsOnAway ?? 0;
    const cornersTotal = cH + cA;
    const shotsOnTotal = sH + sA;
    const pCorner = analysis.model.pNextCorner;
    const pGoal = analysis.model.pNextGoal;
    // Rank: volume so far + chance of more
    const heatCorners = Math.min(cornersTotal / 14, 1) * 0.45 +
        pCorner * 0.4 +
        analysis.model.cornerIntensity * 0.15;
    const heatShots = Math.min(shotsOnTotal / 12, 1) * 0.4 +
        pGoal * 0.45 +
        analysis.model.intensity * 0.15;
    return {
        id: match.id,
        liveId: providerIdToNumber(match.id),
        league: match.league,
        home: match.home,
        away: match.away,
        homeLogo: match.homeLogo,
        awayLogo: match.awayLogo,
        score: `${match.homeGoals}-${match.awayGoals}`,
        minute: match.minute ?? (match.status === 'HT' ? 45 : 0),
        status: match.status,
        cornersHome: cH,
        cornersAway: cA,
        cornersTotal,
        pNextCorner: pCorner,
        expectedExtraCorners: analysis.model.expectedExtraCorners,
        cornerPick: analysis.verdict.cornerMarket,
        cornerConfidence: analysis.verdict.cornerConfidence,
        cornerRisk: analysis.verdict.cornerRisk,
        heatCorners: Number(heatCorners.toFixed(4)),
        shotsOnHome: sH,
        shotsOnAway: sA,
        shotsOnTotal,
        pNextGoal: pGoal,
        expectedExtraGoals: analysis.model.expectedExtraGoals,
        goalPick: analysis.verdict.market,
        goalConfidence: analysis.verdict.confidence,
        goalRisk: analysis.verdict.goalRisk,
        heatShots: Number(heatShots.toFixed(4)),
        possession: stats?.possessionHome != null || stats?.possessionAway != null
            ? `${stats?.possessionHome ?? 0}% - ${stats?.possessionAway ?? 0}%`
            : undefined,
    };
}
export async function scanLiveHeat(opts) {
    const now = Date.now();
    if (!opts?.force && cache && now - cache.at < CACHE_MS) {
        return cache.data;
    }
    const all = await fetchFootballFeed();
    const live = all.filter(isEligible);
    // Prefer matches already showing volume in the feed list if side stats exist later
    const toFetch = live.slice(0, 56);
    const statsMap = await fetchStatsForMatches(toFetch, 8);
    const evaluated = [];
    for (const match of toFetch) {
        const stats = statsMap.get(match.id) ?? null;
        // Skip rows with zero usable live volume (no corners and no SOT yet)
        const c = (stats?.cornersHome ?? 0) +
            (stats?.cornersAway ?? 0) +
            (stats?.shotsOnHome ?? 0) +
            (stats?.shotsOnAway ?? 0);
        if (!stats || c === 0)
            continue;
        evaluated.push(toHeatPick(match, stats));
    }
    const corners = [...evaluated]
        .filter((p) => p.cornersTotal > 0 || p.pNextCorner >= 0.35)
        .sort((a, b) => b.heatCorners - a.heatCorners || b.cornersTotal - a.cornersTotal)
        .slice(0, 40);
    const shots = [...evaluated]
        .filter((p) => p.shotsOnTotal > 0 || p.pNextGoal >= 0.3)
        .sort((a, b) => b.heatShots - a.heatShots || b.shotsOnTotal - a.shotsOnTotal)
        .slice(0, 40);
    const data = {
        at: new Date().toISOString(),
        corners,
        shots,
        scanned: evaluated.length,
        notice: evaluated.length === 0
            ? 'No live matches with corners / shots-on-target stats yet. Try again shortly.'
            : null,
    };
    cache = { at: Date.now(), data };
    return data;
}
