/** Parse AiScore match URLs and pasted match text into structured stats. */
const AISCORE_RE = /^https?:\/\/(?:www\.|m\.)?aiscore\.com\/(?:[a-z]{2}\/)?match-([^/?#]+)\/([a-z0-9]+)\/?/i;
export function isAiscoreUrl(url) {
    try {
        const u = new URL(url.trim());
        return /(^|\.)aiscore\.com$/i.test(u.hostname) && /\/match-/i.test(u.pathname);
    }
    catch {
        return false;
    }
}
export function parseAiscoreUrl(url) {
    const trimmed = url.trim();
    const m = trimmed.match(AISCORE_RE);
    const notes = [];
    if (!m) {
        notes.push('URL format not recognized. Expected https://www.aiscore.com/match-.../id');
        return { url: trimmed, matchId: null, slug: null, home: 'Home', away: 'Away', notes };
    }
    const slug = m[1];
    const matchId = m[2];
    // slug is team names joined by hyphens — keep readable title-case whole slug split heuristically
    const pretty = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    // Best-effort split: user can fix in form. Prefer " vs " if present in paste later.
    return {
        url: trimmed,
        matchId,
        slug,
        home: pretty,
        away: 'Opponent',
        notes: [
            'Teams loaded from URL slug — paste match page text or fill stats for accuracy.',
        ],
    };
}
function num(m, idx = 1) {
    if (!m)
        return null;
    const n = Number(m[idx]);
    return Number.isFinite(n) ? n : null;
}
/** Parse copied AiScore page text (title, score, stats block). */
export function parseAiscorePaste(text, base) {
    const t = text.replace(/\r/g, '\n');
    const notes = [...(base?.notes ?? [])];
    let home = base?.home ?? 'Home';
    let away = base?.away ?? 'Away';
    const titleVs = t.match(/([^\n|]+?)\s+vs\.?\s+([^\n|(]+?)(?:\s+live|\s+prediction|\s*\(|$)/i) ||
        t.match(/([^\n]+?)\s+vs\.?\s+([^\n]+)/i);
    if (titleVs) {
        home = titleVs[1].trim();
        away = titleVs[2].trim();
    }
    // Score patterns: "1\nHT 0-1\n2" or "1-2" or "HT 0-1"
    let homeGoals = base?.homeGoals ?? null;
    let awayGoals = base?.awayGoals ?? null;
    const scoreLine = t.match(/\b(\d+)\s*[-–:]\s*(\d+)\b/);
    const ht = t.match(/HT\s*(\d+)\s*[-–]\s*(\d+)/i);
    // Vertical score blocks from AiScore markdown dump: home score then away score near HT
    const vert = t.match(/(?:^|\n)(\d)\s*\n\s*HT\s+\d+\s*-\s*\d+\s*\n\s*(\d)(?:\n|$)/i);
    if (vert) {
        homeGoals = Number(vert[1]);
        awayGoals = Number(vert[2]);
    }
    else if (scoreLine && !/^20\d{2}/.test(scoreLine[0])) {
        // avoid matching dates like 2026
        const a = Number(scoreLine[1]);
        const b = Number(scoreLine[2]);
        if (a <= 20 && b <= 20) {
            homeGoals = a;
            awayGoals = b;
        }
    }
    let minute = base?.minute ?? null;
    const minM = t.match(/\b(\d{1,3})['′’]/) ||
        t.match(/\b(\d{1,3})\s*min(?:ute)?s?\b/i);
    if (minM)
        minute = Math.min(120, Number(minM[1]));
    if (ht && minute == null) {
        minute = 45;
        notes.push('Only HT found — assumed minute ~45 unless you set it.');
    }
    let status = base?.status ?? null;
    if (/full\s*time|\bFT\b/i.test(t))
        status = 'FT';
    else if (minute != null && minute !== 45)
        status = 'LIVE';
    else if (/\bHT\b|half\s*time/i.test(t) && (minute == null || minute === 45))
        status = 'HT';
    else if (minute != null)
        status = 'LIVE';
    const possessionHome = num(t.match(/(\d{1,3})%\s*\n?\s*Possession\s*\n?\s*(\d{1,3})%/i)) ??
        num(t.match(/Possession[^\d]*(\d{1,3})%[^\d]*(\d{1,3})%/i));
    const possessionAway = num(t.match(/(\d{1,3})%\s*\n?\s*Possession\s*\n?\s*(\d{1,3})%/i), 2) ??
        num(t.match(/Possession[^\d]*(\d{1,3})%[^\d]*(\d{1,3})%/i), 2);
    // AiScore layout: prefer same-line "N Label N", then stacked home\nLabel\naway
    const pair = (label) => {
        const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Same-line only (no newlines): "3 Shots on target 4"
        const inline = new RegExp(`(\\d+)[^\\d\\n]{0,24}${esc}[^\\d\\n]{0,24}(\\d+)`, 'i');
        const m2 = t.match(inline);
        if (m2)
            return [Number(m2[1]), Number(m2[2])];
        // Classic AiScore stack: 28\nDangerous Attacks\n22
        const stacked = new RegExp(`(\\d+)\\s*\\n\\s*${esc}\\s*\\n\\s*(\\d+)`, 'i');
        const m = t.match(stacked);
        if (m)
            return [Number(m[1]), Number(m[2])];
        return [null, null];
    };
    // Dangerous before plain Attacks so labels don't collide
    const [dangerousHome, dangerousAway] = pair('Dangerous Attacks');
    let attacksHome = null;
    let attacksAway = null;
    const attStacked = t.match(/(?:^|\n)(\d+)\s*\n\s*Attacks\s*\n\s*(\d+)/im);
    if (attStacked) {
        attacksHome = Number(attStacked[1]);
        attacksAway = Number(attStacked[2]);
    }
    else {
        const attInline = t.match(/(?:^|\n)(\d+)\s+Attacks\s+(\d+)/im);
        if (attInline) {
            attacksHome = Number(attInline[1]);
            attacksAway = Number(attInline[2]);
        }
    }
    const [shotsOnHome, shotsOnAway] = pair('Shots on target');
    const [shotsOffHome, shotsOffAway] = pair('Shots off target');
    // Possession special (already % on both sides)
    let possH = possessionHome;
    let possA = possessionAway;
    const possBlock = t.match(/(\d{1,3})%\s*\n\s*Possession\s*\n\s*(\d{1,3})%/i);
    if (possBlock) {
        possH = Number(possBlock[1]);
        possA = Number(possBlock[2]);
    }
    return {
        url: base?.url ?? '',
        matchId: base?.matchId ?? null,
        slug: base?.slug ?? null,
        home,
        away,
        homeGoals,
        awayGoals,
        minute,
        status,
        possessionHome: possH,
        possessionAway: possA,
        shotsOnHome,
        shotsOnAway,
        shotsOffHome,
        shotsOffAway,
        attacksHome,
        attacksAway,
        dangerousHome,
        dangerousAway,
        source: base?.url ? 'mixed' : 'paste',
        notes,
    };
}
