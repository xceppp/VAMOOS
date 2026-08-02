/** Live score feed + match statistics (provider feed API). */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const FEED_SIGN = process.env.LIVE_FEED_SIGN?.trim() || 'SW9D1eZo';
/** Decode baked defaults so provider hostnames are not plaintext in source. */
function baked(b64) {
    return Buffer.from(b64, 'base64').toString('utf8');
}
const FEED_BASE = process.env.LIVE_FEED_BASE?.trim() ||
    baked('aHR0cHM6Ly9nbG9iYWwuZmxhc2hzY29yZS5uaW5qYS8yL3gvZmVlZA==');
const IMAGE_BASE = process.env.LIVE_IMAGE_BASE?.trim() ||
    baked('aHR0cHM6Ly9zdGF0aWMuZmxhc2hzY29yZS5jb20vcmVzL2ltYWdlL2RhdGE=');
const FEED_REFERER = process.env.LIVE_FEED_REFERER?.trim() ||
    baked('aHR0cHM6Ly93d3cuZmxhc2hzY29yZS5jb20v');
/** Upstream crest/badge base — used by the media proxy only. */
export function getLiveImageBase() {
    return IMAGE_BASE;
}
export function getLiveFeedReferer() {
    return FEED_REFERER;
}
const RECENT_FT_SEC = 25 * 60;
/** Live board rows: in-play matches + recently finished so final scores aren't skipped. */
export function selectBoardMatches(all, 
/** Provider ids to keep briefly after they leave the in-play list (FT flip). */
retainUntil) {
    const now = Math.floor(Date.now() / 1000);
    const out = [];
    const seen = new Set();
    for (const m of all) {
        const inPlay = m.status === 'LIVE' || m.status === 'HT' || m.status === 'ET';
        const retainOk = retainUntil != null && (retainUntil.get(m.id) ?? 0) > Date.now();
        const justFinished = m.status === 'FT' &&
            ((m.periodStartTs != null && now - m.periodStartTs <= RECENT_FT_SEC) || retainOk);
        if (!inPlay && !justFinished)
            continue;
        if (seen.has(m.id))
            continue;
        seen.add(m.id);
        out.push(m);
    }
    if (retainUntil) {
        for (const [id, until] of retainUntil) {
            if (until <= Date.now() || seen.has(id))
                continue;
            const m = all.find((x) => x.id === id);
            if (!m)
                continue;
            if (m.status === 'FT' || m.status === 'LIVE' || m.status === 'HT' || m.status === 'ET') {
                seen.add(id);
                out.push(m);
            }
        }
    }
    return out;
}
/**
 * Crest / league badge URL served via our media proxy (never expose upstream hosts to clients).
 * Absolute upstream URLs are accepted as-is only when already non-provider absolute paths.
 */
export function providerImageUrl(file) {
    if (!file)
        return undefined;
    const name = file.trim().replace(/^\//, '');
    if (!name)
        return undefined;
    // Already proxied
    if (name.startsWith('api/media/') || name.startsWith('/api/media/')) {
        return name.startsWith('/') ? name : `/${name}`;
    }
    // Strip accidental absolute upstream URL down to the filename
    const bare = name.includes('/') ? name.split('/').pop() : name;
    if (!bare || bare.includes('://') || bare.includes('..'))
        return undefined;
    return `/api/media/crest/${encodeURIComponent(bare)}`;
}
function headers() {
    return {
        'user-agent': UA,
        accept: '*/*',
        referer: FEED_REFERER,
        'x-fsign': FEED_SIGN,
    };
}
function parseTokens(chunk) {
    const fields = {};
    for (const tok of chunk.split('¬')) {
        if (!tok || !tok.includes('÷'))
            continue;
        const i = tok.indexOf('÷');
        fields[tok.slice(0, i)] = tok.slice(i + 1);
    }
    return fields;
}
function numOrNull(v) {
    if (v == null || v === '')
        return null;
    const n = Number(String(v).replace('%', '').trim());
    return Number.isFinite(n) ? n : null;
}
function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
}
/**
 * Decode provider stage → clock.
 * AO is the start of the *current period* (1H / 2H / ET), not kickoff.
 * Important: stage 38 is first half — NOT extra time.
 */
export function estimateMinute(fields) {
    const ab = Number(fields.AB ?? 0);
    const ac = Number(fields.AC ?? 0);
    const ao = numOrNull(fields.AO);
    const now = Math.floor(Date.now() / 1000);
    const periodElapsed = ao != null ? Math.max(0, Math.floor((now - ao) / 60)) : null;
    // Finished / not started
    if (ab === 3 || ac === 3)
        return { minute: 90, status: 'FT' };
    if (ab === 1 || ac === 1)
        return { minute: null, status: 'NS' };
    // Half-time — frozen clock; UI should show HT, not a running minute
    if (ac === 12)
        return { minute: 45, status: 'HT' };
    // Second half (AO = 2H start)
    if (ac === 13) {
        const m = periodElapsed != null ? clamp(45 + periodElapsed, 46, 90 + 15) : 70;
        return { minute: m, status: 'LIVE' };
    }
    // Extra time only — do NOT include 38 here
    if (ac === 14) {
        const m = periodElapsed != null ? clamp(90 + periodElapsed, 91, 105 + 8) : 95;
        return { minute: m, status: 'ET' };
    }
    if (ac === 15) {
        const m = periodElapsed != null ? clamp(105 + periodElapsed, 106, 120 + 10) : 110;
        return { minute: m, status: 'ET' };
    }
    if (ac === 16 || ac === 17) {
        return { minute: 120, status: 'ET' };
    }
    // First half — feed uses 38 (and sometimes 6/7) for 1H; AO = 1H start
    if (ab === 2 || ac === 38 || ac === 6 || ac === 7) {
        const m = periodElapsed != null ? clamp(periodElapsed, 1, 45 + 15) : 1;
        return { minute: m, status: 'LIVE' };
    }
    // Safe fallback: never add +90 unless we know it's ET
    if (periodElapsed != null) {
        return { minute: clamp(periodElapsed, 1, 120), status: 'LIVE' };
    }
    return { minute: null, status: 'LIVE' };
}
export function parseFootballFeed(raw) {
    const out = [];
    let league = 'Unknown';
    let leagueLogo;
    for (const part of raw.split('~')) {
        if (!part)
            continue;
        const f = parseTokens(part);
        if (f.ZA) {
            league = f.ZA;
            leagueLogo = providerImageUrl(f.OAJ);
        }
        if (!f.AA)
            continue;
        const { minute, status } = estimateMinute(f);
        const homeSlug = f.WU || null;
        const awaySlug = f.WV || null;
        const slug = homeSlug && awaySlug ? `${homeSlug}-${awaySlug}` : homeSlug || awaySlug || 'match';
        out.push({
            id: f.AA,
            home: f.AE || f.CX || 'Home',
            away: f.AF || 'Away',
            homeLogo: providerImageUrl(f.OA),
            awayLogo: providerImageUrl(f.OB),
            homeTeamId: f.JA || undefined,
            awayTeamId: f.JB || undefined,
            homeGoals: numOrNull(f.AG) ?? 0,
            awayGoals: numOrNull(f.AH) ?? 0,
            league,
            leagueLogo,
            statusCode: Number(f.AB ?? 0),
            stageCode: Number(f.AC ?? 0),
            minute,
            status,
            periodStartTs: numOrNull(f.AO),
            kickoffTs: numOrNull(f.AD),
            homeSlug,
            awaySlug,
            url: `/match/${providerIdToNumber(f.AA)}`,
        });
    }
    return out;
}
let feedCache = null;
const dayFeedCache = new Map();
export async function fetchFootballFeed(force = false) {
    if (!force && feedCache && Date.now() - feedCache.at < 1_200) {
        return feedCache.matches;
    }
    const matches = await fetchFootballFeedDay(0, force);
    feedCache = { at: Date.now(), matches };
    return matches;
}
/** Day board: 0 = today, 1 = tomorrow, … */
export async function fetchFootballFeedDay(dayOffset, force = false) {
    const day = Math.max(-1, Math.min(7, Math.trunc(dayOffset)));
    const cached = dayFeedCache.get(day);
    const ttl = day === 0 ? 1_200 : 45_000;
    if (!force && cached && Date.now() - cached.at < ttl) {
        return cached.matches;
    }
    const url = `${FEED_BASE}/f_1_${day}_3_en_1?t=${Date.now()}`;
    const res = await fetch(url, { headers: headers() });
    if (!res.ok)
        throw new Error(`Live feed day ${day} HTTP ${res.status}`);
    const matches = parseFootballFeed(await res.text());
    dayFeedCache.set(day, { at: Date.now(), matches });
    if (day === 0)
        feedCache = { at: Date.now(), matches };
    return matches;
}
export function selectUpcomingMatches(all) {
    const now = Math.floor(Date.now() / 1000) - 5 * 60;
    return all
        .filter((m) => m.status === 'NS')
        .filter((m) => m.kickoffTs == null || m.kickoffTs >= now)
        .sort((a, b) => (a.kickoffTs ?? 0) - (b.kickoffTs ?? 0));
}
export async function fetchUpcomingFeedMatches(scorePopularity, days = 3) {
    const count = Math.max(1, Math.min(7, Math.trunc(days)));
    const offsets = Array.from({ length: count }, (_, i) => i);
    const dayResults = await Promise.all(offsets.map(async (dayOffset) => {
        const all = await fetchFootballFeedDay(dayOffset, dayOffset === 0);
        const upcoming = selectUpcomingMatches(all).map((m) => toLiveMatch(m, scorePopularity({ league: m.league, homeName: m.home, awayName: m.away })));
        return { dayOffset, matches: upcoming };
    }));
    return { days: dayResults, at: new Date().toISOString() };
}
/** Tiny per-match score endpoint — much faster than reloading the full board. */
export function parseScorePulse(raw) {
    const f = parseTokens(raw.split('~')[0] ?? raw);
    if (f.DE == null || f.DF == null)
        return null;
    return {
        homeGoals: numOrNull(f.DE) ?? 0,
        awayGoals: numOrNull(f.DF) ?? 0,
        statusCode: Number(f.DA ?? f.AB ?? 0),
        stageCode: Number(f.DB ?? f.AC ?? 0),
        periodStartTs: numOrNull(f.DD ?? f.AO),
    };
}
export async function fetchMatchScorePulse(matchId) {
    try {
        const res = await fetch(`${FEED_BASE}/dc_1_${matchId}?t=${Date.now()}`, {
            headers: headers(),
        });
        if (!res.ok)
            return null;
        const text = await res.text();
        if (text.length < 8)
            return null;
        return parseScorePulse(text);
    }
    catch {
        return null;
    }
}
export function applyScorePulse(match, pulse) {
    const { minute, status } = estimateMinute({
        AB: String(pulse.statusCode),
        AC: String(pulse.stageCode),
        AO: pulse.periodStartTs != null ? String(pulse.periodStartTs) : undefined,
    });
    const stub = {
        id: match.providerId ?? String(match.id),
        home: match.home.name,
        away: match.away.name,
        homeGoals: pulse.homeGoals,
        awayGoals: pulse.awayGoals,
        league: match.league,
        statusCode: pulse.statusCode,
        stageCode: pulse.stageCode,
        minute,
        status,
        periodStartTs: pulse.periodStartTs,
        kickoffTs: null,
        homeSlug: null,
        awaySlug: null,
        url: '',
    };
    return {
        ...match,
        goals: {
            home: status === 'NS' ? null : pulse.homeGoals,
            away: status === 'NS' ? null : pulse.awayGoals,
        },
        status: toMatchStatus(stub),
        elapsed: status === 'NS' || status === 'FT' || status === 'HT' ? null : minute,
    };
}
/** Find one match in the (cached) feed by provider id or hashed app id. */
export async function findFeedMatch(opts) {
    const all = await fetchFootballFeed();
    if (opts.providerId) {
        const hit = all.find((m) => m.id === opts.providerId);
        if (hit)
            return hit;
    }
    if (opts.liveId != null) {
        return all.find((m) => providerIdToNumber(m.id) === opts.liveId);
    }
    return undefined;
}
export function parseStatsFeed(raw) {
    const periods = [];
    let period = null;
    let group = 'Top stats';
    const ensurePeriod = (name) => {
        let hit = periods.find((p) => p.name.toLowerCase() === name.toLowerCase());
        if (!hit) {
            hit = { name, rows: [] };
            periods.push(hit);
        }
        period = hit;
        group = 'Top stats';
        return hit;
    };
    for (const part of raw.split('~')) {
        if (!part)
            continue;
        const f = parseTokens(part);
        if (f.SE) {
            ensurePeriod(f.SE);
            continue;
        }
        const current = period ?? ensurePeriod('Match');
        if (f.SF) {
            group = f.SF;
            continue;
        }
        if (f.SG && f.SH != null) {
            const key = f.SG.toLowerCase();
            // Keep first occurrence in this period (feed repeats labels across groups)
            if (!current.rows.some((r) => r.type.toLowerCase() === key)) {
                current.rows.push({
                    type: f.SG,
                    home: f.SH,
                    away: f.SI ?? '',
                    group,
                });
            }
        }
    }
    // Prefer full-match block; fallback to richest period
    const matchPeriod = periods.find((p) => /^match$/i.test(p.name)) ||
        [...periods].sort((a, b) => b.rows.length - a.rows.length)[0] ||
        { name: 'Match', rows: [] };
    const rawMap = {};
    for (const row of matchPeriod.rows) {
        rawMap[row.type] = { home: row.home, away: row.away };
    }
    const pick = (...labels) => {
        for (const label of labels) {
            const hit = matchPeriod.rows.find((r) => r.type.toLowerCase() === label.toLowerCase());
            if (hit)
                return hit;
        }
        for (const label of labels) {
            const hit = matchPeriod.rows.find((r) => r.type.toLowerCase().includes(label.toLowerCase()));
            if (hit)
                return hit;
        }
        return null;
    };
    const poss = pick('Ball possession', 'Possession');
    const sot = pick('Shots on target');
    const soff = pick('Shots off target');
    const total = pick('Total shots');
    const corners = pick('Corner kicks', 'Corners');
    const xg = pick('Expected goals (xG)', 'xG');
    return {
        possessionHome: numOrNull(poss?.home),
        possessionAway: numOrNull(poss?.away),
        shotsOnHome: numOrNull(sot?.home),
        shotsOnAway: numOrNull(sot?.away),
        shotsOffHome: numOrNull(soff?.home),
        shotsOffAway: numOrNull(soff?.away),
        totalShotsHome: numOrNull(total?.home),
        totalShotsAway: numOrNull(total?.away),
        cornersHome: numOrNull(corners?.home),
        cornersAway: numOrNull(corners?.away),
        xgHome: numOrNull(xg?.home),
        xgAway: numOrNull(xg?.away),
        rows: matchPeriod.rows,
        periods,
        raw: rawMap,
    };
}
export async function fetchMatchStats(matchId) {
    try {
        const res = await fetch(`${FEED_BASE}/df_st_1_${matchId}`, { headers: headers() });
        if (!res.ok)
            return null;
        const text = await res.text();
        if (text.length < 20)
            return null;
        return parseStatsFeed(text);
    }
    catch {
        return null;
    }
}
function parseOddValue(v) {
    if (v == null || v === '')
        return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    return Number.isFinite(n) && n > 1 ? Number(n.toFixed(2)) : null;
}
/**
 * Live 1X2 odds from the provider odds GraphQL (HOME_DRAW_AWAY / FULL_TIME).
 * Maps selections via participant ids when available.
 */
export async function fetchMatchLiveOdds(matchId, homeTeamId, awayTeamId) {
    const url = `https://global.ds.lsapp.eu/odds/pq_graphql?_hash=oce` +
        `&eventId=${encodeURIComponent(matchId)}&projectId=2&geoIpCode=US&geoIpSubdivisionCode=NY`;
    try {
        const res = await fetch(url, {
            headers: {
                'user-agent': UA,
                accept: 'application/json',
                referer: FEED_REFERER,
            },
        });
        if (!res.ok)
            return null;
        const json = (await res.json());
        const markets = json.data?.findOddsByEventId?.odds;
        if (!markets?.length)
            return null;
        const live = markets.filter((m) => m.bettingType === 'HOME_DRAW_AWAY' &&
            m.bettingScope === 'FULL_TIME' &&
            m.hasLiveBettingOffers &&
            Array.isArray(m.odds) &&
            m.odds.length >= 3);
        const pool = live.length ? live : markets.filter((m) => m.bettingType === 'HOME_DRAW_AWAY' &&
            m.bettingScope === 'FULL_TIME' &&
            Array.isArray(m.odds) &&
            m.odds.length >= 3);
        if (!pool.length)
            return null;
        const preferIds = [16, 5, 15, 417, 841];
        const picked = preferIds.map((id) => pool.find((m) => m.bookmakerId === id)).find(Boolean) ?? pool[0];
        const items = (picked.odds ?? []).filter((o) => o.active !== false);
        if (items.length < 3)
            return null;
        const byParticipant = new Map();
        let draw = null;
        for (const item of items) {
            const val = parseOddValue(item.value);
            if (item.eventParticipantId == null || item.eventParticipantId === '') {
                draw = val;
            }
            else {
                byParticipant.set(item.eventParticipantId, val);
            }
        }
        let home = null;
        let away = null;
        if (homeTeamId && byParticipant.has(homeTeamId)) {
            home = byParticipant.get(homeTeamId) ?? null;
        }
        if (awayTeamId && byParticipant.has(awayTeamId)) {
            away = byParticipant.get(awayTeamId) ?? null;
        }
        // Fallback: provider often sends [home, away, draw]
        if (home == null || away == null || draw == null) {
            const ordered = items.map((i) => parseOddValue(i.value));
            const nullIdx = items.findIndex((i) => i.eventParticipantId == null || i.eventParticipantId === '');
            if (nullIdx >= 0)
                draw = draw ?? ordered[nullIdx];
            const sides = items
                .map((i, idx) => ({ id: i.eventParticipantId, val: ordered[idx] }))
                .filter((x) => x.id);
            if (home == null && sides[0])
                home = sides[0].val;
            if (away == null && sides[1])
                away = sides[1].val;
        }
        if (home == null && draw == null && away == null)
            return null;
        return { home, draw, away };
    }
    catch {
        return null;
    }
}
/** Parse summary/incidents feed into timeline events. */
export function parseEventsFeed(raw) {
    const out = [];
    // Events can share a chunk; split on each incident id marker.
    const chunks = raw.split(/~?(?=III÷)/).filter((c) => c.includes('III÷'));
    for (const chunk of chunks) {
        // A chunk may contain Out + In substitution pairs — split on IK labels via IE pairs
        const tokens = chunk.split('¬').filter(Boolean);
        let cur = {};
        const flush = () => {
            if (!cur.label && !cur.player)
                return;
            const label = cur.label || 'Event';
            if (/substitution - in/i.test(label)) {
                cur = {};
                return;
            }
            const minRaw = (cur.minute || '').replace("'", '');
            const minute = numOrNull(minRaw);
            let type = 'Var';
            let detail = label;
            if (/goal/i.test(label) && !/disallowed|cancelled/i.test(label)) {
                type = 'Goal';
                detail = /penalty/i.test(label) ? 'Penalty' : 'Normal Goal';
            }
            else if (/yellow/i.test(label)) {
                type = 'Card';
                detail = 'Yellow Card';
            }
            else if (/red/i.test(label)) {
                type = 'Card';
                detail = 'Red Card';
            }
            else if (/substitution/i.test(label)) {
                type = 'subst';
                detail = label;
            }
            out.push({
                minute,
                extra: null,
                type,
                detail,
                teamSide: cur.side === '1' ? 'home' : cur.side === '2' ? 'away' : null,
                player: cur.player || null,
                assist: null,
            });
            cur = { minute: cur.minute, side: cur.side };
        };
        for (const tok of tokens) {
            const i = tok.indexOf('÷');
            if (i < 0)
                continue;
            const k = tok.slice(0, i);
            const v = tok.slice(i + 1);
            if (k === 'III') {
                flush();
                cur = {};
            }
            else if (k === 'IB')
                cur.minute = v;
            else if (k === 'IA')
                cur.side = v;
            else if (k === 'IF') {
                // New player inside same incident (sub in/out)
                if (cur.player && cur.label)
                    flush();
                cur.player = v;
            }
            else if (k === 'IK') {
                if (cur.label && cur.player)
                    flush();
                cur.label = v;
            }
        }
        flush();
    }
    return out;
}
export async function fetchMatchEvents(matchId) {
    try {
        const res = await fetch(`${FEED_BASE}/df_sui_1_${matchId}`, { headers: headers() });
        if (!res.ok)
            return [];
        const text = await res.text();
        if (text.length < 20)
            return [];
        return parseEventsFeed(text);
    }
    catch {
        return [];
    }
}
/** Ordered rows for the detail UI — full Match period, preferred order first. */
export function statsToRows(stats) {
    const preferred = [
        'Expected goals (xG)',
        'Ball possession',
        'Total shots',
        'Shots on target',
        'Shots off target',
        'Blocked shots',
        'Big chances',
        'Shots inside the box',
        'Shots outside the box',
        'Hit the woodwork',
        'Corner kicks',
        'Offsides',
        'Touches in opposition box',
        'Passes',
        'Accurate through passes',
        'Long passes',
        'Passes in final third',
        'Crosses',
        'Expected assists (xA)',
        'xG on target (xGOT)',
        'Free kicks',
        'Throw ins',
        'Fouls',
        'Yellow cards',
        'Red cards',
        'Tackles',
        'Duels won',
        'Clearances',
        'Interceptions',
        'Errors leading to shot',
        'Errors leading to goal',
        'Goalkeeper saves',
        'xGOT faced',
        'Goals prevented',
        'Goal kicks',
    ];
    const source = stats.rows.length
        ? stats.rows
        : Object.entries(stats.raw).map(([type, v]) => ({ type, home: v.home, away: v.away }));
    const byKey = new Map(source.map((r) => [r.type.toLowerCase(), r]));
    const rows = [];
    const seen = new Set();
    for (const label of preferred) {
        const hit = byKey.get(label.toLowerCase());
        if (!hit)
            continue;
        seen.add(label.toLowerCase());
        rows.push({ type: hit.type, home: hit.home, away: hit.away });
    }
    for (const row of source) {
        const key = row.type.toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        rows.push({ type: row.type, home: row.home, away: row.away });
    }
    return rows;
}
export function periodsToRows(stats) {
    return stats.periods.map((p) => ({
        name: p.name,
        statistics: p.rows.map((r) => ({ type: r.type, home: r.home, away: r.away })),
    }));
}
async function mapPool(items, concurrency, fn) {
    const results = new Array(items.length);
    let i = 0;
    async function worker() {
        while (i < items.length) {
            const idx = i++;
            results[idx] = await fn(items[idx]);
        }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
    return results;
}
export async function fetchStatsForMatches(matches, concurrency = 6) {
    const map = new Map();
    await mapPool(matches, concurrency, async (m) => {
        const stats = await fetchMatchStats(m.id);
        if (stats)
            map.set(m.id, stats);
        return null;
    });
    return map;
}
/** Stable numeric id from provider alphanumeric id (for favorites / routes). */
export function providerIdToNumber(id) {
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) {
        h ^= id.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 1_999_999_999) + 1;
}
function toMatchStatus(m) {
    if (m.status === 'HT' || m.stageCode === 12)
        return 'HT';
    if (m.status === 'FT')
        return 'FT';
    if (m.status === 'NS')
        return 'NS';
    if (m.status === 'ET' || m.stageCode === 14 || m.stageCode === 15 || m.stageCode === 16) {
        return 'ET';
    }
    if (m.stageCode === 13)
        return '2H';
    // 38 / 6 / 7 = first half on the live feed
    if (m.stageCode === 38 || m.stageCode === 6 || m.stageCode === 7)
        return '1H';
    if (m.minute != null && m.minute > 45)
        return '2H';
    if (m.minute != null)
        return '1H';
    return 'LIVE';
}
export function toLiveMatch(m, popularity) {
    const [country, leagueName] = m.league.includes(':')
        ? m.league.split(':').map((s) => s.trim())
        : [undefined, m.league];
    return {
        id: providerIdToNumber(m.id),
        providerId: m.id,
        homeProviderTeamId: m.homeTeamId,
        awayProviderTeamId: m.awayTeamId,
        league: leagueName || m.league,
        leagueLogo: m.leagueLogo,
        country,
        popularity,
        home: {
            id: providerIdToNumber(`h:${m.id}`),
            name: m.home,
            logo: m.homeLogo,
        },
        away: {
            id: providerIdToNumber(`a:${m.id}`),
            name: m.away,
            logo: m.awayLogo,
        },
        goals: {
            home: m.status === 'NS' ? null : m.homeGoals,
            away: m.status === 'NS' ? null : m.awayGoals,
        },
        status: toMatchStatus(m),
        // HT/FT show the label, not a fake running clock
        elapsed: m.status === 'NS' || m.status === 'FT' || m.status === 'HT' || m.stageCode === 12
            ? null
            : m.minute,
        kickoff: m.kickoffTs != null ? new Date(m.kickoffTs * 1000).toISOString() : undefined,
    };
}
/** Live board from feed (in-play + recently finished). */
export async function fetchLiveFeedMatches(scorePopularity, retainUntil) {
    const all = await fetchFootballFeed(true);
    return selectBoardMatches(all, retainUntil).map((m) => toLiveMatch(m, scorePopularity({ league: m.league, homeName: m.home, awayName: m.away })));
}
