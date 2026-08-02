/** Higher score = bigger global crowd / attention. */
const LEAGUE_ID_SCORE: Record<number, number> = {
  1: 980, // World Cup
  4: 970, // Euro
  2: 960, // UCL
  3: 900, // UEL
  848: 820, // UECL
  15: 880, // Club World Cup
  39: 950, // Premier League
  140: 940, // La Liga
  135: 930, // Serie A
  78: 920, // Bundesliga
  61: 910, // Ligue 1
  88: 780, // Eredivisie
  94: 770, // Primeira Liga
  144: 760, // Belgian Pro League
  203: 750, // Super Lig
  71: 800, // Brazil Serie A
  128: 740, // Argentina
  262: 720, // Liga MX
  253: 790, // MLS
  307: 810, // Saudi Pro League
  98: 700, // J1
  292: 690, // K League
  45: 860, // FA Cup
  48: 830, // EFL Cup
  143: 850, // Copa del Rey
  137: 840, // Coppa Italia
  81: 835, // DFB Pokal
  66: 825, // Coupe de France
  13: 870, // Copa Libertadores
  11: 800, // Copa Sudamericana
  9: 720, // Copa America
  6: 710, // Africa Cup of Nations
  7: 700, // Asian Cup
  5: 690, // Nations League
  40: 650, // Championship
  141: 640, // Segunda
  136: 630, // Serie B
  79: 620, // 2. Bundesliga
  62: 610, // Ligue 2
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
}): number {
  let score = leaguePopularity(input.leagueId, input.league);
  const names = `${input.homeName} ${input.awayName}`;
  for (const [re, bonus] of BIG_CLUB_BONUS) {
    if (re.test(names)) score += bonus;
  }
  return score;
}
