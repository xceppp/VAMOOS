/** Scan live feed matches for last-15-min goal + corner potential. */
import { fetchFootballFeed, fetchStatsForMatches, providerIdToNumber, } from './liveFeed.js';
import { analyzeGoalPotential } from './goalPotential.js';
const CACHE_MS = 12_000;
let cache = null;
function toParsed(match, stats) {
    const cornersH = stats?.cornersHome ?? null;
    const cornersA = stats?.cornersAway ?? null;
    const totalH = stats?.totalShotsHome ?? null;
    const totalA = stats?.totalShotsAway ?? null;
    const sotH = stats?.shotsOnHome ?? 0;
    const sotA = stats?.shotsOnAway ?? 0;
    const cH = cornersH ?? 0;
    const cA = cornersA ?? 0;
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
        attacksHome: totalH,
        attacksAway: totalA,
        dangerousHome: cH * 2 + sotH > 0 ? cH * 2 + sotH : null,
        dangerousAway: cA * 2 + sotA > 0 ? cA * 2 + sotA : null,
        cornersHome: cornersH,
        cornersAway: cornersA,
        xgHome: stats?.xgHome ?? null,
        xgAway: stats?.xgAway ?? null,
        source: 'mixed',
        notes: [`Live feed · ${match.league}`],
    };
}
function toPick(match, analysis, stats) {
    const liveId = providerIdToNumber(match.id);
    return {
        matchId: match.id,
        liveId,
        league: match.league,
        home: match.home,
        away: match.away,
        homeLogo: match.homeLogo,
        awayLogo: match.awayLogo,
        score: analysis.match.score,
        minute: match.minute ?? analysis.match.minute ?? 0,
        status: match.status,
        url: `/match/${liveId}`,
        pNextGoal: analysis.model.pNextGoal,
        pNextCorner: analysis.model.pNextCorner,
        expectedExtraGoals: analysis.model.expectedExtraGoals,
        expectedExtraCorners: analysis.model.expectedExtraCorners,
        intensity: analysis.model.intensity,
        cornerIntensity: analysis.model.cornerIntensity,
        call: analysis.verdict.call,
        cornerCall: analysis.verdict.cornerCall,
        confidence: analysis.verdict.confidence,
        cornerConfidence: analysis.verdict.cornerConfidence,
        market: analysis.verdict.market,
        cornerMarket: analysis.verdict.cornerMarket,
        reasons: analysis.verdict.reasons,
        stats: analysis.stats,
        xg: stats?.xgHome != null || stats?.xgAway != null
            ? `${stats?.xgHome ?? 0} - ${stats?.xgAway ?? 0}`
            : analysis.stats.xg,
        corners: analysis.stats.corners,
        goalRisk: analysis.verdict.goalRisk,
        cornerRisk: analysis.verdict.cornerRisk,
        risk: analysis.verdict.boardRisk,
    };
}
function isLateWindow(m, minMinute) {
    if (m.status === 'FT' || m.status === 'NS' || m.status === 'HT')
        return false;
    if (m.status === 'ET')
        return true;
    if (m.minute == null)
        return false;
    return m.minute >= minMinute;
}
function rankScore(p) {
    // Closest to FT first; tiny nudge for stronger edges at same minute
    const riskBoost = p.risk === 'green' ? 0.3 : p.risk === 'orange' ? 0.15 : 0;
    return p.minute + riskBoost + Math.max(p.pNextGoal, p.pNextCorner) * 0.01;
}
export async function scanLateGoalPotential(opts) {
    const minMinute = opts?.minMinute ?? 75;
    const now = Date.now();
    if (!opts?.force && cache && now - cache.at < CACHE_MS) {
        return cache.data;
    }
    const all = await fetchFootballFeed();
    const live = all.filter((m) => m.statusCode === 2 || m.status === 'LIVE' || m.status === 'ET' || m.status === 'HT');
    const late = live.filter((m) => isLateWindow(m, minMinute));
    const toFetch = late.slice(0, 48);
    const statsMap = await fetchStatsForMatches(toFetch, 7);
    const evaluated = [];
    for (const match of toFetch) {
        const stats = statsMap.get(match.id) ?? null;
        const analysis = analyzeGoalPotential(toParsed(match, stats));
        evaluated.push(toPick(match, analysis, stats));
    }
    evaluated.sort((a, b) => rankScore(b) - rankScore(a));
    const picks = evaluated.filter((p) => p.risk === 'green');
    const watch = evaluated.filter((p) => p.risk === 'orange');
    const data = {
        at: new Date().toISOString(),
        source: 'live',
        liveTotal: live.filter((m) => m.status === 'LIVE' || m.status === 'ET').length,
        lateWindowTotal: late.length,
        scannedWithStats: toFetch.length,
        picks,
        watch,
        matches: evaluated,
        notice: late.length === 0
            ? `No live matches currently in the last ${90 - minMinute + 1} minutes (from ${minMinute}'). Check again soon.`
            : picks.length === 0
                ? `Scanned ${toFetch.length} late matches — none in the green zone right now.`
                : null,
    };
    cache = { at: now, data };
    return data;
}
