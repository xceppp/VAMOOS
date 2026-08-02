/** Higher score = bigger global crowd / attention. */
const LEAGUE_ID_SCORE: Record<number, number> = {
  1: 980,
  4: 970,
  2: 960,
  3: 900,
  848: 820,
  15: 880,
  39: 950,
  140: 940,
  135: 930,
  78: 920,
  61: 910,
  88: 780,
  94: 770,
  144: 760,
  203: 750,
  71: 800,
  128: 740,
  262: 720,
  253: 790,
  307: 810,
  98: 700,
  292: 690,
  45: 860,
  48: 830,
  143: 850,
  137: 840,
  81: 835,
  66: 825,
  13: 870,
  11: 800,
  9: 720,
  6: 710,
  7: 700,
  5: 690,
  40: 650,
  141: 640,
  136: 630,
  79: 620,
  62: 610,
};

const LEAGUE_NAME_SCORE: Array<[RegExp, number]> = [
  [/uefa champions league/i, 960],
  [/premier league/i, 950],
  [/la liga|primera division/i, 940],
  [/serie a/i, 930],
  [/bundesliga/i, 920],
  [/ligue 1/i, 910],
  [/europa league/i, 900],
  [/club world cup/i, 880],
  [/copa libertadores/i, 870],
  [/fa cup/i, 860],
  [/mls|major league soccer/i, 790],
  [/eredivisie/i, 780],
  [/primeira liga/i, 770],
];

const BIG_CLUB_BONUS: Array<[RegExp, number]> = [
  [/real madrid|barcelona|manchester (city|united)|liverpool|arsenal|chelsea|tottenham|bayern|dortmund|juventus|inter|ac milan|napoli|psg|paris saint|atletico madrid|ajax|benfica|porto|galatasaray|fenerbahce|al[- ]?hilal|al[- ]?nassr|flamengo|river plate|boca juniors/i, 80],
];

export function leaguePopularity(leagueId: number | undefined, leagueName: string): number {
  if (leagueId != null && LEAGUE_ID_SCORE[leagueId] != null) {
    return LEAGUE_ID_SCORE[leagueId];
  }
  for (const [re, score] of LEAGUE_NAME_SCORE) {
    if (re.test(leagueName)) return score;
  }
  return 100;
}

export function matchCrowdScore(input: {
  leagueId?: number;
  league: string;
  homeName: string;
  awayName: string;
  popularity?: number;
}): number {
  if (typeof input.popularity === 'number') return input.popularity;
  let score = leaguePopularity(input.leagueId, input.league);
  const names = `${input.homeName} ${input.awayName}`;
  for (const [re, bonus] of BIG_CLUB_BONUS) {
    if (re.test(names)) score += bonus;
  }
  return score;
}
