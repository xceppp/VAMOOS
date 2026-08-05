/**
 * Pure TypeScript Dixon-Coles + Elo board engine.
 * Fits team strengths from pack history (or synthesized prior matches),
 * applies recent form + H2H, then scores Dixon-Coles scorelines.
 * Reads offline league packs from apps/predictor/data/leagues — no Python required.
 */
import { existsSync, readFileSync, readdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const LEAGUE_ALIASES = {
    mls: 'mls',
    'major league soccer': 'mls',
    'usa major league soccer': 'mls',
    'premier league': 'premier_league',
    'england premier league': 'premier_league',
    'english premier league': 'premier_league',
    epl: 'premier_league',
    pl: 'premier_league',
    'la liga': 'la_liga',
    laliga: 'la_liga',
    'spain la liga': 'la_liga',
    spain: 'la_liga',
    'serie a': 'serie_a',
    'italy serie a': 'serie_a',
    italy: 'serie_a',
    bundesliga: 'bundesliga',
    'germany bundesliga': 'bundesliga',
    germany: 'bundesliga',
    'ligue 1': 'ligue_1',
    'france ligue 1': 'ligue_1',
    france: 'ligue_1',
    'liga mx': 'liga_mx',
    'mexico liga mx': 'liga_mx',
    mexico: 'liga_mx',
    ucl: 'ucl',
    'champions league': 'ucl',
    'uefa champions league': 'ucl',
    'europe champions league': 'ucl',
};
function clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
}
function factorial(n) {
    let r = 1;
    for (let i = 2; i <= n; i++)
        r *= i;
    return r;
}
function poissonPmf(k, lam) {
    if (lam <= 0)
        return k === 0 ? 1 : 0;
    return (Math.exp(-lam) * lam ** k) / factorial(k);
}
function dixonColesTau(i, j, lamH, lamA, rho) {
    if (i === 0 && j === 0)
        return 1 - lamH * lamA * rho;
    if (i === 0 && j === 1)
        return 1 + lamH * rho;
    if (i === 1 && j === 0)
        return 1 + lamA * rho;
    if (i === 1 && j === 1)
        return 1 - rho;
    return 1;
}
function normName(name) {
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        // Only strip generic club suffixes — never "city"/"united" (Man City ≠ Man Utd)
        .replace(/\b(fc|cf|sc|afc|ac|as|ssc|ud|cd|rcd|sd|club)\b/g, ' ')
        .replace(/[^a-z0-9]+/g, '');
}
/** Mulberry32 — deterministic PRNG for synthetic history. */
function mulberry32(seed) {
    let t = seed >>> 0;
    return () => {
        t += 0x6d2b79f5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}
function gauss(rng, mean, sd) {
    const u = Math.max(1e-9, rng());
    const v = Math.max(1e-9, rng());
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return mean + z * sd;
}
function packsDir() {
    const candidates = [
        resolve(__dirname, '../../predictor/data/leagues'),
        resolve(process.cwd(), 'apps/predictor/data/leagues'),
        resolve(process.cwd(), 'predictor/data/leagues'),
    ];
    for (const d of candidates) {
        if (existsSync(d))
            return d;
    }
    return candidates[0];
}
const packCache = new Map();
const fittedCache = new Map();
function loadPack(slug) {
    if (packCache.has(slug))
        return packCache.get(slug);
    const path = resolve(packsDir(), `${slug}.json`);
    if (!existsSync(path))
        return null;
    const pack = JSON.parse(readFileSync(path, 'utf8'));
    packCache.set(slug, pack);
    return pack;
}
export function resolveLeagueSlug(league) {
    const raw = (league || '').trim();
    if (!raw)
        return null;
    const parts = raw.split(/\s*[-–|/]\s*/);
    const candidates = [raw, parts[parts.length - 1] || raw, parts[0] || raw];
    const slugs = new Set(Object.values(LEAGUE_ALIASES));
    for (const c of candidates) {
        const key = c.trim().toLowerCase().replace(/[-_]/g, ' ');
        const slugKey = c.trim().toLowerCase().replace(/[-\s]/g, '_');
        if (slugs.has(slugKey))
            return slugKey;
        if (LEAGUE_ALIASES[key])
            return LEAGUE_ALIASES[key];
        for (const [alias, slug] of Object.entries(LEAGUE_ALIASES)) {
            if (key.includes(alias) || alias.includes(key))
                return slug;
        }
    }
    return null;
}
function synthesizeHistory(teams, gamesPerTeam = 12, seed = 42) {
    const rng = mulberry32(seed);
    const history = [];
    if (teams.length < 2)
        return history;
    const now = Date.now();
    for (let dayBack = gamesPerTeam * 2; dayBack > 0; dayBack--) {
        let i = dayBack % teams.length;
        let j = (dayBack * 3 + 1) % teams.length;
        if (i === j)
            j = (j + 1) % teams.length;
        const home = teams[i];
        const away = teams[j];
        const lamH = 1.25 * (home.attack ?? 1) * (away.defense ?? 1) * 1.1;
        const lamA = 1.1 * (away.attack ?? 1) * (home.defense ?? 1);
        const hg = Math.max(0, Math.min(5, Math.round(gauss(rng, lamH, 0.85))));
        const ag = Math.max(0, Math.min(5, Math.round(gauss(rng, lamA, 0.85))));
        history.push({
            fixture: { date: new Date(now - dayBack * 86_400_000).toISOString() },
            teams: {
                home: { id: home.id, name: home.name },
                away: { id: away.id, name: away.name },
            },
            goals: { home: hg, away: ag },
        });
    }
    return history;
}
function movEloMultiplier(goalDiff) {
    const d = Math.abs(goalDiff);
    if (d <= 1)
        return 1;
    if (d === 2)
        return 1.5;
    return 1.75 + (d - 3) * 0.125;
}
function fitLeague(slug, pack) {
    if (fittedCache.has(slug))
        return fittedCache.get(slug);
    const cfg = pack.calibration || {};
    const cal = {
        rho: Number(cfg.rho ?? -0.1),
        homeAdv: Number(cfg.home_advantage ?? 1.12),
        variance: Number(cfg.scoring_variance ?? 1),
        parity: Number(cfg.parity ?? 1),
        maxConf: Number(cfg.max_displayed_confidence ?? 0.72),
    };
    const packTeams = pack.teams || [];
    const realHistory = Boolean(pack.history_rows && pack.history_rows.length > 0);
    const rows = realHistory
        ? pack.history_rows
        : synthesizeHistory(packTeams, 12, Number(pack.seed ?? 42));
    const samples = new Map();
    const elo = new Map();
    const names = new Map();
    const historyPairs = [];
    const homeGoals = [];
    const awayGoals = [];
    const homeW = [];
    const awayW = [];
    const sorted = [...rows].sort((a, b) => String(a.fixture?.date || '').localeCompare(String(b.fixture?.date || '')));
    const nRows = sorted.length;
    const halfLife = 12;
    const decay = Math.log(2) / halfLife;
    for (let idx = 0; idx < sorted.length; idx++) {
        const row = sorted[idx];
        const hid = row.teams?.home?.id;
        const aid = row.teams?.away?.id;
        const hg = row.goals?.home;
        const ag = row.goals?.away;
        if (hid == null || aid == null || hg == null || ag == null)
            continue;
        const hname = row.teams?.home?.name || String(hid);
        const aname = row.teams?.away?.name || String(aid);
        names.set(hid, hname);
        names.set(aid, aname);
        const w = Math.exp(-decay * (nRows - 1 - idx));
        homeGoals.push(hg);
        awayGoals.push(ag);
        homeW.push(w);
        awayW.push(w);
        if (!samples.has(hid))
            samples.set(hid, []);
        if (!samples.has(aid))
            samples.set(aid, []);
        samples.get(hid).push({ gf: hg, ga: ag, isHome: true, w });
        samples.get(aid).push({ gf: ag, ga: hg, isHome: false, w });
        historyPairs.push({ homeId: hid, awayId: aid, hg, ag });
        const eh = elo.get(hid) ?? 1500;
        const ea = elo.get(aid) ?? 1500;
        const expH = 1 / (1 + 10 ** ((ea - eh - 60) / 400));
        const scoreH = hg > ag ? 1 : hg === ag ? 0.5 : 0;
        const mov = movEloMultiplier(hg - ag);
        const k = 20 * mov * (0.65 + 0.35 * w);
        elo.set(hid, eh + k * (scoreH - expH));
        elo.set(aid, ea + k * (1 - scoreH - (1 - expH)));
    }
    let avgHome = 1.35;
    let avgAway = 1.15;
    const swH = homeW.reduce((a, b) => a + b, 0);
    const swA = awayW.reduce((a, b) => a + b, 0);
    if (homeGoals.length && swH > 0) {
        avgHome = homeGoals.reduce((s, g, i) => s + g * homeW[i], 0) / swH;
        avgAway = awayGoals.reduce((s, g, i) => s + g * awayW[i], 0) / swA;
    }
    const leagueAvg = Math.max(0.55, (avgHome + avgAway) / 2);
    const priorStrength = 6;
    const formGames = 6;
    const shrink = (obs, nEff, prior = 1) => (nEff * obs + priorStrength * prior) / (nEff + priorStrength);
    const teams = new Map();
    const byNorm = new Map();
    const allIds = new Set([...names.keys(), ...packTeams.map((t) => t.id)]);
    for (const tid of allIds) {
        const packT = packTeams.find((t) => t.id === tid);
        const name = names.get(tid) || packT?.name || String(tid);
        const samp = samples.get(tid) || [];
        let gf = leagueAvg;
        let ga = leagueAvg;
        let nEff = 0;
        if (samp.length) {
            const wSum = samp.reduce((s, x) => s + x.w, 0);
            gf = samp.reduce((s, x) => s + x.gf * x.w, 0) / wSum;
            ga = samp.reduce((s, x) => s + x.ga * x.w, 0) / wSum;
            nEff = wSum;
        }
        let attack = clamp(shrink(gf / leagueAvg, nEff), 0.45, 2.2);
        let defense = clamp(shrink(ga / leagueAvg, nEff), 0.45, 2.2);
        const homeS = samp.filter((x) => x.isHome);
        const awayS = samp.filter((x) => !x.isHome);
        let attackHome;
        let defenseHome;
        let attackAway;
        let defenseAway;
        if (homeS.length) {
            const hw = homeS.reduce((s, x) => s + x.w, 0);
            const hgf = homeS.reduce((s, x) => s + x.gf * x.w, 0) / hw;
            const hga = homeS.reduce((s, x) => s + x.ga * x.w, 0) / hw;
            attackHome = clamp(shrink(hgf / Math.max(avgHome, 0.4), hw), 0.45, 2.3);
            defenseHome = clamp(shrink(hga / Math.max(avgAway, 0.35), hw), 0.45, 2.3);
        }
        else {
            attackHome = clamp(attack * 1.04, 0.45, 2.3);
            defenseHome = clamp(defense * 0.97, 0.45, 2.3);
        }
        if (awayS.length) {
            const aw = awayS.reduce((s, x) => s + x.w, 0);
            const agf = awayS.reduce((s, x) => s + x.gf * x.w, 0) / aw;
            const aga = awayS.reduce((s, x) => s + x.ga * x.w, 0) / aw;
            attackAway = clamp(shrink(agf / Math.max(avgAway, 0.35), aw), 0.45, 2.3);
            defenseAway = clamp(shrink(aga / Math.max(avgHome, 0.4), aw), 0.45, 2.3);
        }
        else {
            attackAway = clamp(attack * 0.96, 0.45, 2.3);
            defenseAway = clamp(defense * 1.03, 0.45, 2.3);
        }
        let teamElo = elo.get(tid) ?? 1500;
        // Blend pack priors so curated attack/defense still matter
        if (packT) {
            const att = packT.attack ?? 1;
            const deff = packT.defense ?? 1;
            attack = 0.55 * attack + 0.45 * att;
            defense = 0.55 * defense + 0.45 * deff;
            attackHome = 0.55 * attackHome + 0.45 * (packT.attack_home ?? att * 1.05);
            attackAway = 0.55 * attackAway + 0.45 * (packT.attack_away ?? att * 0.95);
            defenseHome = 0.55 * defenseHome + 0.45 * (packT.defense_home ?? deff * 0.95);
            defenseAway = 0.55 * defenseAway + 0.45 * (packT.defense_away ?? deff * 1.05);
            if (packT.elo != null)
                teamElo = 0.55 * teamElo + 0.45 * packT.elo;
        }
        const form = [];
        for (const x of samp.slice(-formGames).reverse()) {
            const diff = x.gf - x.ga;
            form.push(diff > 0 ? 1 : diff === 0 ? 0.5 : 0);
        }
        const fitted = {
            id: tid,
            name,
            attack: clamp(attack, 0.45, 2.2),
            defense: clamp(defense, 0.45, 2.2),
            attack_home: clamp(attackHome, 0.45, 2.3),
            attack_away: clamp(attackAway, 0.45, 2.3),
            defense_home: clamp(defenseHome, 0.45, 2.3),
            defense_away: clamp(defenseAway, 0.45, 2.3),
            elo: teamElo,
            form,
            availability_penalty: clamp(packT?.availability_penalty ?? 0, 0, 1),
            key_absences: packT?.key_absences ?? [],
        };
        teams.set(tid, fitted);
        byNorm.set(normName(name), fitted);
    }
    // Ensure every pack team is indexable even if missing from history
    for (const t of packTeams) {
        if (!teams.has(t.id)) {
            const fitted = {
                id: t.id,
                name: t.name,
                attack: t.attack,
                defense: t.defense,
                attack_home: t.attack_home ?? t.attack * 1.05,
                attack_away: t.attack_away ?? t.attack * 0.95,
                defense_home: t.defense_home ?? t.defense * 0.95,
                defense_away: t.defense_away ?? t.defense * 1.05,
                elo: t.elo,
                form: [],
                availability_penalty: clamp(t.availability_penalty ?? 0, 0, 1),
                key_absences: t.key_absences ?? [],
            };
            teams.set(t.id, fitted);
            byNorm.set(normName(t.name), fitted);
        }
    }
    const fitted = {
        slug,
        name: pack.name || slug,
        avgHome,
        avgAway,
        teams,
        byNorm,
        history: historyPairs,
        realHistory,
        cal,
    };
    fittedCache.set(slug, fitted);
    return fitted;
}
const TEAM_ALIASES = {
    mancity: 'manchestercity',
    manchesterc: 'manchestercity',
    manunited: 'manchesterunited',
    manutd: 'manchesterunited',
    manut: 'manchesterunited',
    spurs: 'tottenham',
    tottenhamhotspur: 'tottenham',
    newcastleunited: 'newcastle',
    brightonandhovealbion: 'brighton',
    brightonhovealbion: 'brighton',
    wolverhampton: 'wolves',
    wolverhamptonwanderers: 'wolves',
    nottmforest: 'nottinghamforest',
    nottingham: 'nottinghamforest',
    forest: 'nottinghamforest',
    westhamunited: 'westham',
    leicestercity: 'leicester',
    leedsunited: 'leeds',
    athleticomadrid: 'atleticomadrid',
    atletico: 'atleticomadrid',
    intermilan: 'inter',
    internazionale: 'inter',
    bayern: 'bayernmunich',
    fcbayern: 'bayernmunich',
    dortmund: 'borussiadortmund',
    bvb: 'borussiadortmund',
    psg: 'parissaintgermain',
    parissg: 'parissaintgermain',
};
function canonicalNorm(name) {
    const n = normName(name);
    return TEAM_ALIASES[n] || n;
}
function findFittedTeam(name, league) {
    const n = canonicalNorm(name);
    if (!n)
        return null;
    for (const [tn, team] of league.byNorm) {
        if (canonicalNorm(tn) === n || tn === n)
            return team;
    }
    let best = null;
    let bestLen = 0;
    for (const [tn, team] of league.byNorm) {
        const cn = canonicalNorm(tn);
        if (!cn)
            continue;
        if (n.includes(cn) || cn.includes(n) || n.includes(tn) || tn.includes(n)) {
            const score = Math.min(n.length, cn.length);
            if (score > bestLen) {
                best = team;
                bestLen = score;
            }
        }
    }
    return best;
}
function formIndex(team) {
    if (!team.form.length)
        return 0.5;
    return team.form.reduce((a, b) => a + b, 0) / team.form.length;
}
function h2hStats(league, homeId, awayId) {
    let meetings = 0;
    let sumH = 0;
    let sumA = 0;
    for (const m of league.history) {
        if (m.homeId === homeId && m.awayId === awayId) {
            meetings++;
            sumH += m.hg;
            sumA += m.ag;
        }
        else if (m.homeId === awayId && m.awayId === homeId) {
            // Flip venue: goals for today's home = goals they scored when away in that meeting
            meetings++;
            sumH += m.ag;
            sumA += m.hg;
        }
    }
    if (!meetings)
        return { meetings: 0, avgHome: 0, avgAway: 0 };
    return { meetings, avgHome: sumH / meetings, avgAway: sumA / meetings };
}
function expectedGoals(home, away, league) {
    const cal = league.cal;
    let lamH = league.avgHome * home.attack_home * away.defense_away * cal.homeAdv;
    let lamA = league.avgAway * away.attack_away * home.defense_home;
    if (cal.parity !== 1) {
        const blend = clamp(cal.parity - 1, 0, 0.45);
        lamH = lamH * (1 - blend) + league.avgHome * cal.homeAdv * blend;
        lamA = lamA * (1 - blend) + league.avgAway * blend;
    }
    if (cal.variance !== 1) {
        const mid = (lamH + lamA) / 2;
        lamH = mid + (lamH - mid) * cal.variance;
        lamA = mid + (lamA - mid) * cal.variance;
        const scale = clamp(cal.variance, 0.75, 1.35);
        lamH *= scale;
        lamA *= scale;
    }
    const eloDiff = home.elo - away.elo;
    const eloScale = 800 * clamp(cal.parity, 0.75, 1.4);
    const eloFactor = clamp(1 + eloDiff / eloScale, 0.78, 1.28);
    lamH *= eloFactor;
    lamA *= 2 - eloFactor;
    const formHome = formIndex(home);
    const formAway = formIndex(away);
    const formDelta = formHome - formAway;
    // Stronger form tilt than the old flat model so recent wins move scorelines
    lamH *= clamp(1 + 0.16 * formDelta, 0.84, 1.18);
    lamA *= clamp(1 - 0.16 * formDelta, 0.84, 1.18);
    // Synthetic H2H is noise — only blend real finished meetings into λ.
    const h2h = league.realHistory
        ? h2hStats(league, home.id, away.id)
        : { meetings: 0, avgHome: 0, avgAway: 0 };
    if (h2h.meetings >= 2) {
        const weight = clamp(0.14 + 0.05 * Math.min(h2h.meetings, 5), 0.14, 0.28);
        lamH = lamH * (1 - weight) + h2h.avgHome * weight;
        lamA = lamA * (1 - weight) + h2h.avgAway * weight;
    }
    for (const [team, isHome] of [
        [home, true],
        [away, false],
    ]) {
        let pen = clamp(team.availability_penalty, 0, 1);
        if (team.key_absences.length > 0 && pen <= 0) {
            pen = Math.min(0.12 * team.key_absences.length, 0.35);
        }
        if (pen > 0) {
            const factor = 1 - 0.35 * pen;
            if (isHome) {
                lamH *= factor;
                lamA *= 1 + 0.08 * pen;
            }
            else {
                lamA *= factor;
                lamH *= 1 + 0.08 * pen;
            }
        }
    }
    return {
        lamH: clamp(lamH, 0.3, 3.8),
        lamA: clamp(lamA, 0.22, 3.4),
        formHome,
        formAway,
        h2h,
    };
}
function scorelineMatrix(lamH, lamA, rho, maxGoals = 8) {
    const grid = Array.from({ length: maxGoals + 1 }, () => Array(maxGoals + 1).fill(0));
    let total = 0;
    for (let i = 0; i <= maxGoals; i++) {
        const pi = poissonPmf(i, lamH);
        for (let j = 0; j <= maxGoals; j++) {
            const p = Math.max(0, pi * poissonPmf(j, lamA) * dixonColesTau(i, j, lamH, lamA, rho));
            grid[i][j] = p;
            total += p;
        }
    }
    if (total > 0) {
        for (let i = 0; i <= maxGoals; i++) {
            for (let j = 0; j <= maxGoals; j++)
                grid[i][j] /= total;
        }
    }
    return grid;
}
/**
 * Live final-score matrix: current score + remaining Poisson extras.
 */
function liveFinalMatrix(lamH, lamA, hg, ag, remFrac, maxExtra = 6) {
    const rh = Math.max(0.01, lamH * remFrac);
    const ra = Math.max(0.01, lamA * remFrac);
    const size = hg + ag + maxExtra + 1;
    const grid = Array.from({ length: size }, () => Array(size).fill(0));
    let total = 0;
    for (let i = 0; i <= maxExtra; i++) {
        const pi = poissonPmf(i, rh);
        for (let j = 0; j <= maxExtra; j++) {
            const p = pi * poissonPmf(j, ra);
            const fh = hg + i;
            const fa = ag + j;
            if (!grid[fh])
                grid[fh] = [];
            grid[fh][fa] = (grid[fh][fa] || 0) + p;
            total += p;
        }
    }
    if (total > 0) {
        for (let i = 0; i < grid.length; i++) {
            for (let j = 0; j < (grid[i]?.length || 0); j++) {
                if (grid[i][j])
                    grid[i][j] /= total;
            }
        }
    }
    return grid;
}
/**
 * Pick the scoreline tipsters actually want: mode conditional on 1X2 favorite.
 * Absolute bivariate mode collapses to 1-1 for most mid λ pairs — avoid that trap.
 */
function pickMostLikelyScore(grid, pHome, pDraw, pAway) {
    const cells = [];
    for (let i = 0; i < grid.length; i++) {
        for (let j = 0; j < (grid[i]?.length || 0); j++) {
            const p = grid[i][j] || 0;
            if (p > 0)
                cells.push({ i, j, p });
        }
    }
    cells.sort((a, b) => b.p - a.p);
    const top = cells.slice(0, 5).map((c) => ({
        score: `${c.i}-${c.j}`,
        prob: round4(c.p),
    }));
    let side = 'draw';
    if (pHome >= pDraw && pHome >= pAway)
        side = 'home';
    else if (pAway >= pDraw && pAway >= pHome)
        side = 'away';
    const matchesSide = (c) => {
        if (side === 'home')
            return c.i > c.j;
        if (side === 'away')
            return c.i < c.j;
        return c.i === c.j;
    };
    const conditional = cells.filter(matchesSide);
    const abs = cells[0];
    const cond = conditional[0];
    // If absolute mode agrees with market, use it.
    // If absolute is a draw but market isn't (classic 1-1 trap), force conditional.
    // If market is draw, prefer draw scores; only override if a win score clearly dominates.
    let chosen = cond || abs;
    if (abs && cond) {
        const absIsDraw = abs.i === abs.j;
        const marketIsDraw = side === 'draw';
        if (matchesSide(abs)) {
            chosen = abs;
        }
        else if (absIsDraw && !marketIsDraw) {
            chosen = cond;
        }
        else if (!marketIsDraw && cond.p >= abs.p * 0.72) {
            chosen = cond;
        }
        else if (marketIsDraw && absIsDraw) {
            chosen = abs;
        }
        else if (marketIsDraw && !absIsDraw && abs.p > cond.p * 1.35) {
            chosen = abs;
        }
        else {
            chosen = cond;
        }
    }
    // Soft expected-goals nudge: among near-ties (±8%), prefer closer to λ rounding
    if (chosen && conditional.length > 1) {
        const near = conditional.filter((c) => c.p >= chosen.p * 0.92);
        if (near.length > 1) {
            // prefer higher total when over lean, else keep mode
            near.sort((a, b) => b.p - a.p || Math.abs(a.i - a.j) - Math.abs(b.i - b.j));
            chosen = near[0];
        }
    }
    return { best: chosen ? `${chosen.i}-${chosen.j}` : '1-0', top };
}
function remainingFraction(minute, status) {
    const st = (status || '').toUpperCase();
    if (st === 'HT')
        return 0.5;
    if (minute == null)
        return 1;
    const m = Math.max(0, Math.min(Number(minute), 120));
    if (st === 'ET' || m > 90)
        return Math.max(0.05, (120 - m) / 30) * 0.25;
    return Math.max(0.08, (90 - m) / 90);
}
function parseScore(score) {
    if (!score)
        return null;
    const parts = score.replace(':', '-').split('-');
    if (parts.length !== 2)
        return null;
    const a = Number(parts[0].trim());
    const b = Number(parts[1].trim());
    if (!Number.isFinite(a) || !Number.isFinite(b))
        return null;
    return [a, b];
}
function liveResidual(lamH, lamA, hg, ag, remFrac) {
    const rh = Math.max(0.01, lamH * remFrac);
    const ra = Math.max(0.01, lamA * remFrac);
    let pHome = 0;
    let pDraw = 0;
    let pAway = 0;
    let pBtts = 0;
    let pO15 = 0;
    let pO25 = 0;
    let pO35 = 0;
    const maxExtra = 8;
    for (let i = 0; i <= maxExtra; i++) {
        const pi = poissonPmf(i, rh);
        for (let j = 0; j <= maxExtra; j++) {
            const p = pi * poissonPmf(j, ra);
            const fh = hg + i;
            const fa = ag + j;
            const total = fh + fa;
            if (fh > fa)
                pHome += p;
            else if (fh === fa)
                pDraw += p;
            else
                pAway += p;
            if (fh > 0 && fa > 0)
                pBtts += p;
            if (total >= 2)
                pO15 += p;
            if (total >= 3)
                pO25 += p;
            if (total >= 4)
                pO35 += p;
        }
    }
    const s = pHome + pDraw + pAway;
    if (s > 0) {
        pHome /= s;
        pDraw /= s;
        pAway /= s;
    }
    return {
        p_home: pHome,
        p_draw: pDraw,
        p_away: pAway,
        p_btts: pBtts,
        p_over_15: pO15,
        p_over_25: pO25,
        p_over_35: pO35,
        rem_home: rh,
        rem_away: ra,
        p_next_home: rh / (rh + ra),
        p_next_away: ra / (rh + ra),
        p_any_goal: 1 - Math.exp(-(rh + ra)),
    };
}
function calibrateProb(raw, maxConf) {
    const r = clamp(raw, 0, 0.999);
    const shrunk = 0.5 + (r - 0.5) * 0.82;
    return clamp(Math.min(shrunk, maxConf), 0, maxConf);
}
function ouPick(over, line) {
    const under = Math.max(0, 1 - over);
    if (over >= under) {
        return { pick: `OVER ${line}`, side: 'over', prob: over, over, under };
    }
    return { pick: `UNDER ${line}`, side: 'under', prob: under, over, under };
}
function buildMarkets(args) {
    let { pHome, pDraw, pAway, pBtts, pO15, pO25, pO35 } = args;
    let remH = args.lamH;
    let remA = args.lamA;
    let nextGoal = null;
    const scored = parseScore(args.score);
    const st = (args.status || '').toUpperCase();
    const isLive = scored != null &&
        (['LIVE', 'HT', 'ET', '1H', '2H'].includes(st) || args.minute != null);
    if (isLive && scored) {
        const live = liveResidual(args.lamH, args.lamA, scored[0], scored[1], remainingFraction(args.minute, args.status));
        pHome = live.p_home;
        pDraw = live.p_draw;
        pAway = live.p_away;
        pBtts = live.p_btts;
        pO15 = live.p_over_15;
        pO25 = live.p_over_25;
        pO35 = live.p_over_35;
        remH = live.rem_home;
        remA = live.rem_away;
        const nextSide = live.p_next_home >= live.p_next_away ? 'home' : 'away';
        const team = nextSide === 'home' ? args.homeName : args.awayName;
        const nextProb = nextSide === 'home' ? live.p_next_home : live.p_next_away;
        nextGoal = {
            pick: `NEXT GOAL · ${team}`,
            side: nextSide,
            team,
            prob: round4(nextProb),
            anyGoal: round4(live.p_any_goal),
            home: round4(live.p_next_home),
            away: round4(live.p_next_away),
        };
    }
    let side = 'draw';
    let resultLabel = 'DRAW';
    let resultProb = pDraw;
    if (pHome >= pDraw && pHome >= pAway) {
        side = 'home';
        resultLabel = 'HOME WIN';
        resultProb = pHome;
    }
    else if (pAway >= pDraw && pAway >= pHome) {
        side = 'away';
        resultLabel = 'AWAY WIN';
        resultProb = pAway;
    }
    const result = {
        pick: resultLabel,
        side,
        prob: round4(resultProb),
        home: round4(pHome),
        draw: round4(pDraw),
        away: round4(pAway),
    };
    const more = side === 'draw'
        ? { pick: 'EQUAL GOALS', side: 'draw', team: null, prob: round4(pDraw) }
        : {
            pick: `MORE GOALS · ${side === 'home' ? args.homeName : args.awayName}`,
            side,
            team: side === 'home' ? args.homeName : args.awayName,
            prob: round4(resultProb),
        };
    const over15 = ouPick(pO15, '1.5');
    const over25 = ouPick(pO25, '2.5');
    const over35 = ouPick(pO35, '3.5');
    const bttsYes = pBtts;
    const bttsNo = 1 - pBtts;
    const btts = bttsYes >= bttsNo
        ? { pick: 'BTTS YES', side: 'yes', prob: round4(bttsYes), yes: round4(bttsYes), no: round4(bttsNo) }
        : { pick: 'BTTS NO', side: 'no', prob: round4(bttsNo), yes: round4(bttsYes), no: round4(bttsNo) };
    const open = (p) => p > 0.02 && p < 0.98;
    const candidates = [];
    if (open(result.prob))
        candidates.push([result.pick, result.prob]);
    if (open(more.prob))
        candidates.push([more.pick, more.prob]);
    if (open(over25.prob))
        candidates.push([over25.pick, over25.prob]);
    if (open(over35.prob))
        candidates.push([over35.pick, over35.prob]);
    if (open(btts.prob))
        candidates.push([btts.pick, btts.prob]);
    if (nextGoal && (nextGoal.anyGoal ?? 0) >= 0.25 && open(nextGoal.prob)) {
        candidates.push([nextGoal.pick, nextGoal.prob]);
    }
    if (!candidates.length) {
        candidates.push([result.pick, result.prob], [over25.pick, over25.prob], [btts.pick, btts.prob]);
    }
    candidates.sort((a, b) => b[1] - a[1]);
    const [tip, tipRaw] = candidates[0];
    return {
        pick: tip,
        confidence: round4(calibrateProb(tipRaw, args.maxConf)),
        confidenceRaw: round4(tipRaw),
        markets: { result, moreGoals: more, over15, over25, over35, btts, nextGoal },
        prob: {
            home: round4(pHome),
            draw: round4(pDraw),
            away: round4(pAway),
            over15: round4(pO15),
            over25: round4(pO25),
            over35: round4(pO35),
            btts: round4(pBtts),
        },
        expectedRemaining: {
            home: round3(remH),
            away: round3(remA),
            total: round3(remH + remA),
        },
        pHome,
        pDraw,
        pAway,
    };
}
function round4(n) {
    return Math.round(n * 10000) / 10000;
}
function round3(n) {
    return Math.round(n * 1000) / 1000;
}
function potentialLabel(pO25, pO35, pBtts) {
    const bits = [];
    if (pO35 >= 0.4)
        bits.push('HIGH O3.5');
    else if (pO25 >= 0.55)
        bits.push('HIGH O2.5');
    else if (pO25 >= 0.48)
        bits.push('O2.5 lean');
    else
        bits.push('Low goals');
    if (pBtts >= 0.58)
        bits.push('BTTS strong');
    else if (pBtts >= 0.5)
        bits.push('BTTS ok');
    else
        bits.push('BTTS weak');
    return bits.join(' + ');
}
function heatScore(pO15, pO25, pO35, pBtts) {
    return 0.3 * pO25 + 0.2 * pO35 + 0.15 * pO15 + 0.3 * pBtts;
}
function predictOne(m, nextSynth) {
    const slug = resolveLeagueSlug(m.league);
    if (!slug)
        return { skip: `no league pack for '${m.league}'` };
    const pack = loadPack(slug);
    if (!pack)
        return { skip: `pack missing: ${slug}` };
    const league = fitLeague(slug, pack);
    let home = findFittedTeam(m.home, league);
    let away = findFittedTeam(m.away, league);
    const matched = Boolean(home && away);
    if (!home) {
        home = {
            id: nextSynth.n++,
            name: m.home,
            attack: 1,
            defense: 1,
            attack_home: 1.05,
            attack_away: 0.95,
            defense_home: 0.95,
            defense_away: 1.05,
            elo: 1500,
            form: [],
            availability_penalty: 0,
            key_absences: [],
        };
    }
    if (!away) {
        away = {
            id: nextSynth.n++,
            name: m.away,
            attack: 1,
            defense: 1,
            attack_home: 1.05,
            attack_away: 0.95,
            defense_home: 0.95,
            defense_away: 1.05,
            elo: 1500,
            form: [],
            availability_penalty: 0,
            key_absences: [],
        };
    }
    const { lamH, lamA, formHome, formAway, h2h } = expectedGoals(home, away, league);
    const preGrid = scorelineMatrix(lamH, lamA, league.cal.rho);
    let pHome = 0;
    let pDraw = 0;
    let pAway = 0;
    let pBtts = 0;
    let pO15 = 0;
    let pO25 = 0;
    let pO35 = 0;
    for (let i = 0; i < preGrid.length; i++) {
        for (let j = 0; j < preGrid[i].length; j++) {
            const p = preGrid[i][j];
            const total = i + j;
            if (i > j)
                pHome += p;
            else if (i === j)
                pDraw += p;
            else
                pAway += p;
            if (i > 0 && j > 0)
                pBtts += p;
            if (total >= 2)
                pO15 += p;
            if (total >= 3)
                pO25 += p;
            if (total >= 4)
                pO35 += p;
        }
    }
    const s = pHome + pDraw + pAway;
    if (s > 0) {
        pHome /= s;
        pDraw /= s;
        pAway /= s;
    }
    const board = buildMarkets({
        homeName: m.home,
        awayName: m.away,
        lamH,
        lamA,
        pHome,
        pDraw,
        pAway,
        pBtts,
        pO15,
        pO25,
        pO35,
        score: m.score,
        minute: m.minute,
        status: m.status,
        maxConf: league.cal.maxConf,
    });
    const scored = parseScore(m.score);
    const st = (m.status || '').toUpperCase();
    const isLive = scored != null &&
        (['LIVE', 'HT', 'ET', '1H', '2H'].includes(st) || m.minute != null);
    let scoreGrid = preGrid;
    if (isLive && scored) {
        scoreGrid = liveFinalMatrix(lamH, lamA, scored[0], scored[1], remainingFraction(m.minute, m.status));
    }
    const { best, top } = pickMostLikelyScore(scoreGrid, board.pHome, board.pDraw, board.pAway);
    return {
        id: String(m.id),
        liveId: m.liveId,
        league: m.league || league.name || slug,
        slug,
        home: m.home,
        away: m.away,
        homeLogo: m.homeLogo,
        awayLogo: m.awayLogo,
        kickoff: m.kickoff ?? null,
        status: m.status,
        minute: m.minute ?? null,
        score: m.score ?? null,
        matchedTeams: matched,
        pick: board.pick,
        confidence: board.confidence,
        confidenceRaw: board.confidenceRaw,
        mostLikelyScore: best,
        topScores: top,
        potential: potentialLabel(pO25, pO35, pBtts),
        heat: round4(heatScore(pO15, pO25, pO35, pBtts)),
        expectedGoals: {
            home: round3(lamH),
            away: round3(lamA),
            total: round3(lamH + lamA),
        },
        expectedRemaining: board.expectedRemaining,
        prob: board.prob,
        markets: board.markets,
        model: 'dixon-coles-elo',
        signals: {
            formHome: round4(formHome),
            formAway: round4(formAway),
            h2hMeetings: h2h.meetings,
            h2hAvgHome: round3(h2h.avgHome),
            h2hAvgAway: round3(h2h.avgAway),
            matchedHistory: matched,
        },
    };
}
export function runDixonBatch(matches) {
    const dir = packsDir();
    if (!existsSync(dir)) {
        return {
            results: [],
            skipped: [],
            error: `League packs missing at ${dir}`,
        };
    }
    const results = [];
    const skipped = [];
    const nextSynth = { n: 90_000 };
    for (const m of matches) {
        if (!m.id || !m.home || !m.away) {
            skipped.push({ id: m.id, reason: 'missing fields' });
            continue;
        }
        const out = predictOne(m, nextSynth);
        if ('skip' in out) {
            skipped.push({ id: m.id, reason: out.skip });
            continue;
        }
        results.push(out);
    }
    results.sort((a, b) => b.heat - a.heat || b.confidence - a.confidence);
    return { results, skipped };
}
export function listAvailablePacks() {
    const dir = packsDir();
    if (!existsSync(dir))
        return [];
    return readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace(/\.json$/, ''));
}
/** Test/helper: clear fitted caches after pack edits. */
export function clearDixonCaches() {
    packCache.clear();
    fittedCache.clear();
}
