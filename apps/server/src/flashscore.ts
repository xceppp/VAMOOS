/** Flashscore live feed + match statistics (unofficial feed API). */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const FSIGN = 'SW9D1eZo';
const FEED_BASE = 'https://global.flashscore.ninja/2/x/feed';
const IMAGE_BASE = 'https://static.flashscore.com/res/image/data';

export interface FlashscoreMatch {
  id: string;
  home: string;
  away: string;
  homeLogo?: string;
  awayLogo?: string;
  /** Flashscore participant id (JA) */
  homeTeamId?: string;
  /** Flashscore participant id (JB) */
  awayTeamId?: string;
  homeGoals: number;
  awayGoals: number;
  league: string;
  leagueLogo?: string;
  statusCode: number; // AB
  stageCode: number; // AC
  minute: number | null;
  status: 'LIVE' | 'HT' | 'FT' | 'NS' | 'ET';
  periodStartTs: number | null;
  /** Kickoff unix seconds (AD). */
  kickoffTs: number | null;
  homeSlug: string | null;
  awaySlug: string | null;
  url: string;
}

export interface FlashscoreLiveOdds {
  home: number | null;
  draw: number | null;
  away: number | null;
}

const RECENT_FT_SEC = 25 * 60;

/** Live board rows: in-play matches + recently finished so final scores aren't skipped. */
export function selectBoardMatches(
  all: FlashscoreMatch[],
  /** Flashscore ids to keep briefly after they leave the in-play list (FT flip). */
  retainUntil?: Map<string, number>,
): FlashscoreMatch[] {
  const now = Math.floor(Date.now() / 1000);
  const out: FlashscoreMatch[] = [];
  const seen = new Set<string>();

  for (const m of all) {
    const inPlay = m.status === 'LIVE' || m.status === 'HT' || m.status === 'ET';
    const retainOk = retainUntil != null && (retainUntil.get(m.id) ?? 0) > Date.now();
    const justFinished =
      m.status === 'FT' &&
      ((m.periodStartTs != null && now - m.periodStartTs <= RECENT_FT_SEC) || retainOk);
    if (!inPlay && !justFinished) continue;
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }

  if (retainUntil) {
    for (const [id, until] of retainUntil) {
      if (until <= Date.now() || seen.has(id)) continue;
      const m = all.find((x) => x.id === id);
      if (!m) continue;
      if (m.status === 'FT' || m.status === 'LIVE' || m.status === 'HT' || m.status === 'ET') {
        seen.add(id);
        out.push(m);
      }
    }
  }

  return out;
}

/** Flashscore crest / league badge URL from feed image filename. */
export function flashscoreImageUrl(file: string | null | undefined): string | undefined {
  if (!file) return undefined;
  const name = file.trim();
  if (!name || name.includes('://')) return name || undefined;
  return `${IMAGE_BASE}/${name.replace(/^\//, '')}`;
}

export interface FlashscoreStatRow {
  type: string;
  home: string;
  away: string;
  group?: string;
}

export interface FlashscoreStatPeriod {
  name: string;
  rows: FlashscoreStatRow[];
}

export interface FlashscoreStats {
  possessionHome: number | null;
  possessionAway: number | null;
  shotsOnHome: number | null;
  shotsOnAway: number | null;
  shotsOffHome: number | null;
  shotsOffAway: number | null;
  totalShotsHome: number | null;
  totalShotsAway: number | null;
  cornersHome: number | null;
  cornersAway: number | null;
  xgHome: number | null;
  xgAway: number | null;
  /** Full Match-period rows (all labels Flashscore sent). */
  rows: FlashscoreStatRow[];
  periods: FlashscoreStatPeriod[];
  raw: Record<string, { home: string; away: string }>;
}

function headers(): Record<string, string> {
  return {
    'user-agent': UA,
    accept: '*/*',
    referer: 'https://www.flashscore.com/',
    'x-fsign': FSIGN,
  };
}

function parseTokens(chunk: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const tok of chunk.split('¬')) {
    if (!tok || !tok.includes('÷')) continue;
    const i = tok.indexOf('÷');
    fields[tok.slice(0, i)] = tok.slice(i + 1);
  }
  return fields;
}

function numOrNull(v: string | undefined): number | null {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace('%', '').trim());
  return Number.isFinite(n) ? n : null;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Decode Flashscore stage → clock.
 * AO is the start of the *current period* (1H / 2H / ET), not kickoff.
 * Important: stage 38 is first half — NOT extra time.
 */
export function estimateMinute(fields: {
  AB?: string;
  AC?: string;
  AO?: string;
}): { minute: number | null; status: FlashscoreMatch['status'] } {
  const ab = Number(fields.AB ?? 0);
  const ac = Number(fields.AC ?? 0);
  const ao = numOrNull(fields.AO);
  const now = Math.floor(Date.now() / 1000);
  const periodElapsed = ao != null ? Math.max(0, Math.floor((now - ao) / 60)) : null;

  // Finished / not started
  if (ab === 3 || ac === 3) return { minute: 90, status: 'FT' };
  if (ab === 1 || ac === 1) return { minute: null, status: 'NS' };

  // Half-time — frozen clock; UI should show HT, not a running minute
  if (ac === 12) return { minute: 45, status: 'HT' };

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

  // First half — Flashscore uses 38 (and sometimes 6/7) for 1H; AO = 1H start
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

export function parseFootballFeed(raw: string): FlashscoreMatch[] {
  const out: FlashscoreMatch[] = [];
  let league = 'Unknown';
  let leagueLogo: string | undefined;
  for (const part of raw.split('~')) {
    if (!part) continue;
    const f = parseTokens(part);
    if (f.ZA) {
      league = f.ZA;
      leagueLogo = flashscoreImageUrl(f.OAJ);
    }
    if (!f.AA) continue;
    const { minute, status } = estimateMinute(f);
    const homeSlug = f.WU || null;
    const awaySlug = f.WV || null;
    const slug =
      homeSlug && awaySlug ? `${homeSlug}-${awaySlug}` : homeSlug || awaySlug || 'match';
    out.push({
      id: f.AA,
      home: f.AE || f.CX || 'Home',
      away: f.AF || 'Away',
      homeLogo: flashscoreImageUrl(f.OA),
      awayLogo: flashscoreImageUrl(f.OB),
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
      url: `https://www.flashscore.com/match/football/${slug}/${f.AA}/#/match-summary/match-statistics/0`,
    });
  }
  return out;
}

let feedCache: { at: number; matches: FlashscoreMatch[] } | null = null;
const dayFeedCache = new Map<number, { at: number; matches: FlashscoreMatch[] }>();

export async function fetchFootballFeed(force = false): Promise<FlashscoreMatch[]> {
  if (!force && feedCache && Date.now() - feedCache.at < 1_200) {
    return feedCache.matches;
  }
  const matches = await fetchFootballFeedDay(0, force);
  feedCache = { at: Date.now(), matches };
  return matches;
}

/** Flashscore day board: 0 = today, 1 = tomorrow, … */
export async function fetchFootballFeedDay(
  dayOffset: number,
  force = false,
): Promise<FlashscoreMatch[]> {
  const day = Math.max(-1, Math.min(7, Math.trunc(dayOffset)));
  const cached = dayFeedCache.get(day);
  const ttl = day === 0 ? 1_200 : 45_000;
  if (!force && cached && Date.now() - cached.at < ttl) {
    return cached.matches;
  }
  const url = `${FEED_BASE}/f_1_${day}_3_en_1?t=${Date.now()}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`Flashscore feed day ${day} HTTP ${res.status}`);
  const matches = parseFootballFeed(await res.text());
  dayFeedCache.set(day, { at: Date.now(), matches });
  if (day === 0) feedCache = { at: Date.now(), matches };
  return matches;
}

export function selectUpcomingMatches(all: FlashscoreMatch[]): FlashscoreMatch[] {
  const now = Math.floor(Date.now() / 1000) - 5 * 60;
  return all
    .filter((m) => m.status === 'NS')
    .filter((m) => m.kickoffTs == null || m.kickoffTs >= now)
    .sort((a, b) => (a.kickoffTs ?? 0) - (b.kickoffTs ?? 0));
}

export async function fetchFlashscoreUpcomingMatches(
  scorePopularity: (input: {
    league: string;
    homeName: string;
    awayName: string;
  }) => number,
  days = 3,
): Promise<{
  days: Array<{ dayOffset: number; matches: import('./types.js').LiveMatch[] }>;
  at: string;
}> {
  const count = Math.max(1, Math.min(7, Math.trunc(days)));
  const offsets = Array.from({ length: count }, (_, i) => i);
  const dayResults = await Promise.all(
    offsets.map(async (dayOffset) => {
      const all = await fetchFootballFeedDay(dayOffset, dayOffset === 0);
      const upcoming = selectUpcomingMatches(all).map((m) =>
        toLiveMatch(
          m,
          scorePopularity({ league: m.league, homeName: m.home, awayName: m.away }),
        ),
      );
      return { dayOffset, matches: upcoming };
    }),
  );
  return { days: dayResults, at: new Date().toISOString() };
}

export interface ScorePulse {
  homeGoals: number;
  awayGoals: number;
  statusCode: number;
  stageCode: number;
  periodStartTs: number | null;
}

/** Tiny Flashscore score endpoint — much faster than reloading the full board. */
export function parseScorePulse(raw: string): ScorePulse | null {
  const f = parseTokens(raw.split('~')[0] ?? raw);
  if (f.DE == null || f.DF == null) return null;
  return {
    homeGoals: numOrNull(f.DE) ?? 0,
    awayGoals: numOrNull(f.DF) ?? 0,
    statusCode: Number(f.DA ?? f.AB ?? 0),
    stageCode: Number(f.DB ?? f.AC ?? 0),
    periodStartTs: numOrNull(f.DD ?? f.AO),
  };
}

export async function fetchMatchScorePulse(matchId: string): Promise<ScorePulse | null> {
  try {
    const res = await fetch(`${FEED_BASE}/dc_1_${matchId}?t=${Date.now()}`, {
      headers: headers(),
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length < 8) return null;
    return parseScorePulse(text);
  } catch {
    return null;
  }
}

export function applyScorePulse(
  match: import('./types.js').LiveMatch,
  pulse: ScorePulse,
): import('./types.js').LiveMatch {
  const { minute, status } = estimateMinute({
    AB: String(pulse.statusCode),
    AC: String(pulse.stageCode),
    AO: pulse.periodStartTs != null ? String(pulse.periodStartTs) : undefined,
  });
  const stub: FlashscoreMatch = {
    id: match.flashscoreId ?? String(match.id),
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

/** Find one match in the (cached) feed by Flashscore id or hashed app id. */
export async function findFlashscoreMatch(
  opts: { flashscoreId?: string; liveId?: number },
): Promise<FlashscoreMatch | undefined> {
  const all = await fetchFootballFeed();
  if (opts.flashscoreId) {
    const hit = all.find((m) => m.id === opts.flashscoreId);
    if (hit) return hit;
  }
  if (opts.liveId != null) {
    return all.find((m) => flashscoreIdToNumber(m.id) === opts.liveId);
  }
  return undefined;
}

export function parseStatsFeed(raw: string): FlashscoreStats {
  const periods: FlashscoreStatPeriod[] = [];
  let period: FlashscoreStatPeriod | null = null;
  let group = 'Top stats';

  const ensurePeriod = (name: string) => {
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
    if (!part) continue;
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
      // Keep first occurrence in this period (Flashscore repeats labels across groups)
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
  const matchPeriod =
    periods.find((p) => /^match$/i.test(p.name)) ||
    [...periods].sort((a, b) => b.rows.length - a.rows.length)[0] ||
    { name: 'Match', rows: [] };

  const rawMap: Record<string, { home: string; away: string }> = {};
  for (const row of matchPeriod.rows) {
    rawMap[row.type] = { home: row.home, away: row.away };
  }

  const pick = (...labels: string[]) => {
    for (const label of labels) {
      const hit = matchPeriod.rows.find((r) => r.type.toLowerCase() === label.toLowerCase());
      if (hit) return hit;
    }
    for (const label of labels) {
      const hit = matchPeriod.rows.find((r) => r.type.toLowerCase().includes(label.toLowerCase()));
      if (hit) return hit;
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

export async function fetchMatchStats(matchId: string): Promise<FlashscoreStats | null> {
  try {
    const res = await fetch(`${FEED_BASE}/df_st_1_${matchId}`, { headers: headers() });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length < 20) return null;
    return parseStatsFeed(text);
  } catch {
    return null;
  }
}

function parseOddValue(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) && n > 1 ? Number(n.toFixed(2)) : null;
}

/**
 * Live 1X2 odds from Flashscore's odds GraphQL (HOME_DRAW_AWAY / FULL_TIME).
 * Maps selections via participant ids when available.
 */
export async function fetchMatchLiveOdds(
  matchId: string,
  homeTeamId?: string,
  awayTeamId?: string,
): Promise<FlashscoreLiveOdds | null> {
  const url =
    `https://global.ds.lsapp.eu/odds/pq_graphql?_hash=oce` +
    `&eventId=${encodeURIComponent(matchId)}&projectId=2&geoIpCode=US&geoIpSubdivisionCode=NY`;
  try {
    const res = await fetch(url, {
      headers: {
        'user-agent': UA,
        accept: 'application/json',
        referer: 'https://www.flashscore.com/',
      },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: {
        findOddsByEventId?: {
          odds?: Array<{
            bookmakerId?: number;
            bettingType?: string;
            bettingScope?: string;
            hasLiveBettingOffers?: boolean;
            odds?: Array<{
              eventParticipantId?: string | null;
              value?: string | number;
              active?: boolean;
            }>;
          }>;
        };
      };
    };
    const markets = json.data?.findOddsByEventId?.odds;
    if (!markets?.length) return null;

    const live = markets.filter(
      (m) =>
        m.bettingType === 'HOME_DRAW_AWAY' &&
        m.bettingScope === 'FULL_TIME' &&
        m.hasLiveBettingOffers &&
        Array.isArray(m.odds) &&
        m.odds.length >= 3,
    );
    const pool = live.length ? live : markets.filter(
      (m) =>
        m.bettingType === 'HOME_DRAW_AWAY' &&
        m.bettingScope === 'FULL_TIME' &&
        Array.isArray(m.odds) &&
        m.odds.length >= 3,
    );
    if (!pool.length) return null;

    const preferIds = [16, 5, 15, 417, 841];
    const picked =
      preferIds.map((id) => pool.find((m) => m.bookmakerId === id)).find(Boolean) ?? pool[0];
    const items = (picked.odds ?? []).filter((o) => o.active !== false);
    if (items.length < 3) return null;

    const byParticipant = new Map<string, number | null>();
    let draw: number | null = null;
    for (const item of items) {
      const val = parseOddValue(item.value);
      if (item.eventParticipantId == null || item.eventParticipantId === '') {
        draw = val;
      } else {
        byParticipant.set(item.eventParticipantId, val);
      }
    }

    let home: number | null = null;
    let away: number | null = null;
    if (homeTeamId && byParticipant.has(homeTeamId)) {
      home = byParticipant.get(homeTeamId) ?? null;
    }
    if (awayTeamId && byParticipant.has(awayTeamId)) {
      away = byParticipant.get(awayTeamId) ?? null;
    }

    // Fallback: Flashscore often sends [home, away, draw]
    if (home == null || away == null || draw == null) {
      const ordered = items.map((i) => parseOddValue(i.value));
      const nullIdx = items.findIndex((i) => i.eventParticipantId == null || i.eventParticipantId === '');
      if (nullIdx >= 0) draw = draw ?? ordered[nullIdx];
      const sides = items
        .map((i, idx) => ({ id: i.eventParticipantId, val: ordered[idx] }))
        .filter((x) => x.id);
      if (home == null && sides[0]) home = sides[0].val;
      if (away == null && sides[1]) away = sides[1].val;
    }

    if (home == null && draw == null && away == null) return null;
    return { home, draw, away };
  } catch {
    return null;
  }
}

export interface FlashscoreEvent {
  minute: number | null;
  extra: number | null;
  type: string;
  detail: string;
  teamSide: 'home' | 'away' | null;
  player: string | null;
  assist: string | null;
}

/** Parse Flashscore summary/incidents feed into timeline events. */
export function parseEventsFeed(raw: string): FlashscoreEvent[] {
  const out: FlashscoreEvent[] = [];

  // Events can share a chunk; split on each incident id marker.
  const chunks = raw.split(/~?(?=III÷)/).filter((c) => c.includes('III÷'));

  for (const chunk of chunks) {
    // A chunk may contain Out + In substitution pairs — split on IK labels via IE pairs
    const tokens = chunk.split('¬').filter(Boolean);
    type PartialEv = {
      minute?: string;
      side?: string;
      player?: string;
      label?: string;
    };
    let cur: PartialEv = {};
    const flush = () => {
      if (!cur.label && !cur.player) return;
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
      } else if (/yellow/i.test(label)) {
        type = 'Card';
        detail = 'Yellow Card';
      } else if (/red/i.test(label)) {
        type = 'Card';
        detail = 'Red Card';
      } else if (/substitution/i.test(label)) {
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
      if (i < 0) continue;
      const k = tok.slice(0, i);
      const v = tok.slice(i + 1);
      if (k === 'III') {
        flush();
        cur = {};
      } else if (k === 'IB') cur.minute = v;
      else if (k === 'IA') cur.side = v;
      else if (k === 'IF') {
        // New player inside same incident (sub in/out)
        if (cur.player && cur.label) flush();
        cur.player = v;
      } else if (k === 'IK') {
        if (cur.label && cur.player) flush();
        cur.label = v;
      }
    }
    flush();
  }

  return out;
}

export async function fetchMatchEvents(matchId: string): Promise<FlashscoreEvent[]> {
  try {
    const res = await fetch(`${FEED_BASE}/df_sui_1_${matchId}`, { headers: headers() });
    if (!res.ok) return [];
    const text = await res.text();
    if (text.length < 20) return [];
    return parseEventsFeed(text);
  } catch {
    return [];
  }
}

/** Ordered rows for the detail UI — full Match period, preferred order first. */
export function statsToRows(stats: FlashscoreStats): Array<{ type: string; home: string | number; away: string | number }> {
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
  const rows: Array<{ type: string; home: string | number; away: string | number }> = [];
  const seen = new Set<string>();

  for (const label of preferred) {
    const hit = byKey.get(label.toLowerCase());
    if (!hit) continue;
    seen.add(label.toLowerCase());
    rows.push({ type: hit.type, home: hit.home, away: hit.away });
  }
  for (const row of source) {
    const key = row.type.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ type: row.type, home: row.home, away: row.away });
  }
  return rows;
}

export function periodsToRows(
  stats: FlashscoreStats,
): Array<{ name: string; statistics: Array<{ type: string; home: string | number; away: string | number }> }> {
  return stats.periods.map((p) => ({
    name: p.name,
    statistics: p.rows.map((r) => ({ type: r.type, home: r.home, away: r.away })),
  }));
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
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

export async function fetchStatsForMatches(
  matches: FlashscoreMatch[],
  concurrency = 6,
): Promise<Map<string, FlashscoreStats>> {
  const map = new Map<string, FlashscoreStats>();
  await mapPool(matches, concurrency, async (m) => {
    const stats = await fetchMatchStats(m.id);
    if (stats) map.set(m.id, stats);
    return null;
  });
  return map;
}

/** Stable numeric id from Flashscore alphanumeric id (for favorites / routes). */
export function flashscoreIdToNumber(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1_999_999_999) + 1;
}

function toMatchStatus(m: FlashscoreMatch): string {
  if (m.status === 'HT' || m.stageCode === 12) return 'HT';
  if (m.status === 'FT') return 'FT';
  if (m.status === 'NS') return 'NS';
  if (m.status === 'ET' || m.stageCode === 14 || m.stageCode === 15 || m.stageCode === 16) {
    return 'ET';
  }
  if (m.stageCode === 13) return '2H';
  // 38 / 6 / 7 = first half on Flashscore
  if (m.stageCode === 38 || m.stageCode === 6 || m.stageCode === 7) return '1H';
  if (m.minute != null && m.minute > 45) return '2H';
  if (m.minute != null) return '1H';
  return 'LIVE';
}

export function toLiveMatch(m: FlashscoreMatch, popularity: number): import('./types.js').LiveMatch {
  const [country, leagueName] = m.league.includes(':')
    ? m.league.split(':').map((s) => s.trim())
    : [undefined, m.league];
  return {
    id: flashscoreIdToNumber(m.id),
    flashscoreId: m.id,
    homeFsTeamId: m.homeTeamId,
    awayFsTeamId: m.awayTeamId,
    league: leagueName || m.league,
    leagueLogo: m.leagueLogo,
    country,
    popularity,
    home: {
      id: flashscoreIdToNumber(`h:${m.id}`),
      name: m.home,
      logo: m.homeLogo,
    },
    away: {
      id: flashscoreIdToNumber(`a:${m.id}`),
      name: m.away,
      logo: m.awayLogo,
    },
    goals: {
      home: m.status === 'NS' ? null : m.homeGoals,
      away: m.status === 'NS' ? null : m.awayGoals,
    },
    status: toMatchStatus(m),
    // HT/FT show the label, not a fake running clock
    elapsed:
      m.status === 'NS' || m.status === 'FT' || m.status === 'HT' || m.stageCode === 12
        ? null
        : m.minute,
    kickoff: m.kickoffTs != null ? new Date(m.kickoffTs * 1000).toISOString() : undefined,
  };
}

/** Live board from Flashscore (in-play + recently finished). */
export async function fetchFlashscoreLiveMatches(
  scorePopularity: (input: {
    league: string;
    homeName: string;
    awayName: string;
  }) => number,
  retainUntil?: Map<string, number>,
): Promise<import('./types.js').LiveMatch[]> {
  const all = await fetchFootballFeed(true);
  return selectBoardMatches(all, retainUntil).map((m) =>
    toLiveMatch(
      m,
      scorePopularity({ league: m.league, homeName: m.home, awayName: m.away }),
    ),
  );
}
