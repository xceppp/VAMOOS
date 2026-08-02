import {
  isAiscoreUrl,
  parseAiscorePaste,
  parseAiscoreUrl,
  type AiscoreParsed,
} from './aiscoreParse.js';
import { analyzeGoalPotential } from './goalPotential.js';

export async function tryFetchAiscore(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (/just a moment|cloudflare|cf-chl|challenge-platform/i.test(text)) return null;
    if (text.length < 2000) return null;
    return text;
  } catch {
    return null;
  }
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export async function buildAiscoreAnalysis(body: {
  url?: string;
  paste?: string;
  manual?: Partial<AiscoreParsed>;
}) {
  const url = (body.url || '').trim();
  if (url && !isAiscoreUrl(url)) {
    throw new Error('Please paste a valid AiScore match link (aiscore.com/match-...)');
  }

  let parsed: AiscoreParsed = {
    url,
    matchId: null,
    slug: null,
    home: 'Home',
    away: 'Away',
    homeGoals: null,
    awayGoals: null,
    minute: null,
    status: null,
    possessionHome: null,
    possessionAway: null,
    shotsOnHome: null,
    shotsOnAway: null,
    shotsOffHome: null,
    shotsOffAway: null,
    attacksHome: null,
    attacksAway: null,
    dangerousHome: null,
    dangerousAway: null,
    source: 'manual',
    notes: [],
  };

  if (url) {
    const fromUrl = parseAiscoreUrl(url);
    parsed = { ...parsed, ...fromUrl, source: 'url' };
    const html = await tryFetchAiscore(url);
    if (html) {
      parsed = parseAiscorePaste(stripHtml(html), parsed);
      parsed.notes.unshift('Fetched live page HTML successfully.');
    } else {
      parsed.notes.unshift(
        'AiScore blocked automatic fetch (Cloudflare). Paste match text or fill stats below.',
      );
    }
  }

  if (body.paste && body.paste.trim().length > 20) {
    parsed = parseAiscorePaste(body.paste, parsed);
    parsed.source = parsed.url ? 'mixed' : 'paste';
  }

  if (body.manual) {
    parsed = { ...parsed, ...body.manual, source: 'manual' };
  }

  const hasScore = parsed.homeGoals != null && parsed.awayGoals != null;
  const hasLiveStats =
    parsed.shotsOnHome != null ||
    parsed.shotsOnAway != null ||
    parsed.dangerousHome != null ||
    parsed.dangerousAway != null ||
    parsed.attacksHome != null;
  if (!hasScore || (!hasLiveStats && parsed.minute == null)) {
    parsed.notes.push(
      'Need score + minute and/or live stats (shots / dangerous attacks) for a real Bet or Nah. Paste the AiScore page or fill the manual form.',
    );
  }

  const analysis = analyzeGoalPotential(parsed);
  return { parsed, analysis };
}
