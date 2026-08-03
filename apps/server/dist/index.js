import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { existsSync } from 'fs';
import { createServer } from 'http';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { buildDemoMatchDetail, buildLiveFeedMatchDetail, fetchMatchDetail, } from './matchDetail.js';
import { buildAiscoreAnalysis } from './predictions.js';
import { scanLateGoalPotential } from './lateGoalScan.js';
import { buildDixonBoard } from './dixonColes.js';
import { ensurePython } from './ensurePython.js';
import { fetchUpcomingFeedMatches, findFeedMatch, getLiveFeedReferer, getLiveImageBase, toLiveMatch, } from './liveFeed.js';
import { matchCrowdScore } from './popularity.js';
import { startPoller } from './poller.js';
import { createWsHub } from './ws.js';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });
dotenv.config({ path: resolve(process.cwd(), '.env') });
const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '0.0.0.0';
function resolveLiveSource(raw) {
    const v = (raw?.trim() || 'live').toLowerCase();
    if (v === 'api-football')
        return 'api-football';
    return 'live';
}
const LIVE_SOURCE = resolveLiveSource(process.env.LIVE_SOURCE);
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? (LIVE_SOURCE === 'live' ? 1_500 : 60_000));
const PULSE_INTERVAL_MS = Number(process.env.PULSE_INTERVAL_MS ?? 700);
const SIDE_INTERVAL_MS = Number(process.env.SIDE_INTERVAL_MS ?? 8_000);
const API_KEY = process.env.API_FOOTBALL_KEY?.trim() || undefined;
const DETAIL_CACHE_MS = 12_000;
const detailCache = new Map();
/** Built SPA folder — prefers server/public (deploy copy), then apps/web/dist. */
function resolveWebDist() {
    const candidates = [
        resolve(__dirname, '../public'),
        resolve(__dirname, 'public'),
        resolve(__dirname, '../../web/dist'),
        resolve(process.cwd(), 'apps/web/dist'),
        resolve(process.cwd(), 'apps/server/public'),
        resolve(process.cwd(), 'public'),
    ];
    for (const dir of candidates) {
        if (existsSync(resolve(dir, 'index.html')))
            return dir;
    }
    return null;
}
const webDist = resolveWebDist();
const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
const server = createServer(app);
const hub = createWsHub(server);
const poller = startPoller(hub, {
    apiKey: API_KEY,
    intervalMs: POLL_INTERVAL_MS,
    pulseIntervalMs: PULSE_INTERVAL_MS,
    sideIntervalMs: SIDE_INTERVAL_MS,
    source: LIVE_SOURCE,
});
/** Proxy provider crests so clients never see upstream image hosts. */
app.get('/api/media/crest/:file', async (req, res) => {
    const file = String(req.params.file || '').trim();
    if (!file || file.includes('..') || file.includes('/') || file.includes('\\')) {
        res.status(400).end();
        return;
    }
    try {
        const upstream = `${getLiveImageBase()}/${file}`;
        const upstreamRes = await fetch(upstream, {
            headers: {
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                referer: getLiveFeedReferer(),
            },
        });
        if (!upstreamRes.ok) {
            res.status(upstreamRes.status === 404 ? 404 : 502).end();
            return;
        }
        const type = upstreamRes.headers.get('content-type') || 'image/png';
        res.setHeader('Content-Type', type);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        const buf = Buffer.from(await upstreamRes.arrayBuffer());
        res.send(buf);
    }
    catch {
        res.status(502).end();
    }
});
app.get('/health', (_req, res) => {
    res.json({
        ok: true,
        mode: poller.state.mode,
        source: poller.state.source,
        matches: poller.state.matches.length,
        hasApiKey: Boolean(API_KEY),
        rateLimited: poller.state.rateLimited,
        rateLimitedUntil: poller.state.rateLimitedUntil,
        notice: poller.state.notice,
        pollIntervalMs: POLL_INTERVAL_MS,
        pulseIntervalMs: PULSE_INTERVAL_MS,
        lastOkAt: poller.state.lastOkAt,
        lastPulseAt: poller.state.lastPulseAt,
        clients: hub.openClientCount(),
    });
});
app.get('/api/matches', (_req, res) => {
    res.json({
        mode: poller.state.mode,
        matches: poller.state.matches,
        rateLimited: poller.state.rateLimited,
        notice: poller.state.notice,
        at: new Date().toISOString(),
        lastOkAt: poller.state.lastOkAt,
        lastPulseAt: poller.state.lastPulseAt,
    });
});
const fixturesCache = new Map();
const FIXTURES_CACHE_MS = 40_000;
/** Scheduled matches for today + coming days (live day feeds). */
app.get('/api/fixtures', async (req, res) => {
    const daysRaw = Number(req.query.days ?? 4);
    const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(7, Math.trunc(daysRaw))) : 4;
    const cached = fixturesCache.get(days);
    if (cached && Date.now() - cached.at < FIXTURES_CACHE_MS) {
        res.json(cached.data);
        return;
    }
    try {
        const data = await fetchUpcomingFeedMatches((input) => matchCrowdScore({
            league: input.league,
            homeName: input.homeName,
            awayName: input.awayName,
        }), days);
        const payload = {
            source: 'live',
            ...data,
        };
        fixturesCache.set(days, { at: Date.now(), data: payload });
        res.json(payload);
    }
    catch (err) {
        console.warn('[fixtures]', err);
        res.status(502).json({ error: 'Failed to load upcoming fixtures' });
    }
});
/** Tell the server which matches to pulse first (favorites). */
app.post('/api/watch', (req, res) => {
    const ids = Array.isArray(req.body?.matchIds)
        ? req.body.matchIds.map((x) => Number(x)).filter((n) => Number.isFinite(n))
        : [];
    poller.setWatchIds(ids);
    res.json({ ok: true, watching: ids.length });
});
app.get('/api/matches/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
        res.status(400).json({ error: 'Invalid match id' });
        return;
    }
    let seed = poller.findMatch(id);
    // Always refresh score/status from the live feed (seed alone can be stale after FT).
    try {
        const hit = await findFeedMatch({
            providerId: seed?.providerId,
            liveId: id,
        });
        if (hit) {
            seed = toLiveMatch(hit, matchCrowdScore({
                league: hit.league,
                homeName: hit.home,
                awayName: hit.away,
            }));
            poller.rememberOne(seed);
        }
    }
    catch (err) {
        console.warn('[match-detail] live feed resolve failed', err);
    }
    const cached = detailCache.get(id);
    if (cached && Date.now() - cached.at < DETAIL_CACHE_MS) {
        // Reuse stats/events cache but always serve the freshest scoreboard.
        if (seed) {
            res.json({ ...cached.data, match: seed });
            return;
        }
        res.json(cached.data);
        return;
    }
    // Live-feed-sourced matches — pull live stats + timeline
    if (seed?.providerId) {
        try {
            const detail = await buildLiveFeedMatchDetail(seed);
            detailCache.set(id, { at: Date.now(), data: detail });
            res.json(detail);
            return;
        }
        catch (err) {
            console.error('[match-detail-feed]', err);
            res.json({
                match: seed,
                events: [],
                statistics: [],
                lineups: [],
                mode: 'live',
            });
            return;
        }
    }
    // While rate-limited, never spend another detail request
    if (poller.state.rateLimited) {
        if (cached) {
            res.json(cached.data);
            return;
        }
        if (seed) {
            res.json({
                match: seed,
                events: [],
                statistics: [],
                lineups: [],
                mode: 'live',
            });
            return;
        }
    }
    try {
        if (API_KEY) {
            const detail = await fetchMatchDetail(API_KEY, id);
            if (!detail) {
                res.status(404).json({ error: 'Match not found' });
                return;
            }
            detailCache.set(id, { at: Date.now(), data: detail });
            res.json(detail);
            return;
        }
        if (!seed) {
            res.status(404).json({ error: 'Match not found in live feed' });
            return;
        }
        const demo = buildDemoMatchDetail(seed);
        detailCache.set(id, { at: Date.now(), data: demo });
        res.json(demo);
    }
    catch (err) {
        console.error('[match-detail]', err);
        if (cached) {
            res.json(cached.data);
            return;
        }
        if (seed) {
            res.json({
                match: seed,
                events: [],
                statistics: [],
                lineups: [],
                mode: poller.state.mode,
            });
            return;
        }
        res.status(502).json({
            error: err instanceof Error ? err.message : 'Failed to load match detail',
        });
    }
});
app.post('/api/predictions/aiscore', async (req, res) => {
    try {
        const result = await buildAiscoreAnalysis({
            url: typeof req.body?.url === 'string' ? req.body.url : '',
            paste: typeof req.body?.paste === 'string' ? req.body.paste : '',
            manual: req.body?.manual && typeof req.body.manual === 'object' ? req.body.manual : undefined,
        });
        res.json(result);
    }
    catch (err) {
        res.status(400).json({
            error: err instanceof Error ? err.message : 'Prediction failed',
        });
    }
});
app.get('/api/predictions/late-goals', async (req, res) => {
    try {
        const minMinute = Number(req.query.minMinute ?? 75);
        const force = req.query.refresh === '1' || req.query.refresh === 'true';
        const result = await scanLateGoalPotential({
            minMinute: Number.isFinite(minMinute) ? minMinute : 75,
            force,
        });
        res.json(result);
    }
    catch (err) {
        console.error('[late-goals]', err);
        res.status(502).json({
            error: err instanceof Error ? err.message : 'Scan failed',
        });
    }
});
/** Dixon-Coles + Elo board for live + upcoming matches (Predictions tab). */
app.get('/api/predictions/board', async (req, res) => {
    try {
        const force = req.query.refresh === '1' || req.query.refresh === 'true';
        const board = await buildDixonBoard({ force });
        res.json(board);
    }
    catch (err) {
        console.error('[predictions-board]', err);
        res.status(502).json({
            error: err instanceof Error ? err.message : 'Dixon-Coles board failed',
        });
    }
});
// Serve the built web/PWA app (after root `npm run build`)
if (webDist) {
    app.use(express.static(webDist, { index: false }));
    app.get(/^(?!\/api\/|\/health$|\/ws).*/, (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD')
            return next();
        res.sendFile(resolve(webDist, 'index.html'), (err) => {
            if (err)
                next(err);
        });
    });
}
else {
    app.get('/', (_req, res) => {
        res
            .status(503)
            .type('html')
            .send('<!doctype html><meta charset="utf-8"><title>VAMOOS</title>' +
            '<body style="font-family:sans-serif;padding:2rem">' +
            '<h1>VAMOOS API is running</h1>' +
            '<p>The web UI was not built into this deploy.</p>' +
            '<p>Set the host <strong>Build Command</strong> to <code>npm run build</code> ' +
            'and <strong>Start Command</strong> to <code>npm start</code>.</p>' +
            '<p>Health: <a href="/health">/health</a></p>' +
            '</body>');
    });
}
server.listen(PORT, HOST, () => {
    console.log(`[server] http://localhost:${PORT}`);
    console.log(`[server] http://${HOST}:${PORT} (LAN)`);
    console.log(`[server] ws://localhost:${PORT}/ws`);
    console.log(`[server] live source=${LIVE_SOURCE} poll=${POLL_INTERVAL_MS}ms`);
    if (webDist) {
        console.log(`[server] serving web UI from ${webDist}`);
    }
    else {
        console.warn('[server] web UI missing — run `npm run build` so / serves the app');
    }
    void ensurePython().then((bin) => {
        if (bin)
            console.log(`[server] Dixon-Coles Python ready: ${bin}`);
        else
            console.warn('[server] Dixon-Coles Python unavailable — predictions will fail until bootstrap works');
    });
});
