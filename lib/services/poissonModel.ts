// Poisson expected-goals model -- the actual statistical engine behind
// confidence scores. Deliberately NOT an LLM: this needs to be
// calibrated and backtestable (does "70% confidence" actually win ~70%
// of the time against historical results?), which an LLM's own number
// generation can't reliably give us. Gemini's job is turning this
// model's output into a human-readable reason, not generating the score.
//
// Standard approach: each team gets an attack/defense strength relative
// to league average, split by home/away (home advantage is real and
// substantial in football). Two teams' strengths combine into expected
// goals for a specific fixture, which becomes a Poisson probability
// distribution over scorelines, which any market's probability (1X2,
// Over/Under, BTTS) can be derived from.

export interface TeamMatchResult {
  goalsFor: number;
  goalsAgainst: number;
  isHome: boolean;
}

export interface TeamStrength {
  attackHome: number;  // relative to league avg home goals scored, 1.0 = average
  attackAway: number;
  defenseHome: number; // relative to league avg home goals conceded, 1.0 = average
  defenseAway: number;
  sampleSize: number;
}

export interface LeagueAverages {
  avgHomeGoals: number;
  avgAwayGoals: number;
}

// Reasonable defaults if a specific league's averages aren't available
// yet -- typical across most European top-flight leagues.
export const DEFAULT_LEAGUE_AVERAGES: LeagueAverages = {
  avgHomeGoals: 1.5,
  avgAwayGoals: 1.15,
};

// Minimum matches before we trust a team's computed strength at all.
// Below this, the Confidence Engine should report "not enough data"
// rather than a score built on 2 games.
export const MIN_SAMPLE_SIZE = 5;

export function computeTeamStrength(
  matches: TeamMatchResult[],
  leagueAvg: LeagueAverages = DEFAULT_LEAGUE_AVERAGES,
): TeamStrength {
  const homeMatches = matches.filter((m) => m.isHome);
  const awayMatches = matches.filter((m) => !m.isHome);

  const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

  const homeGoalsFor = avg(homeMatches.map((m) => m.goalsFor));
  const homeGoalsAgainst = avg(homeMatches.map((m) => m.goalsAgainst));
  const awayGoalsFor = avg(awayMatches.map((m) => m.goalsFor));
  const awayGoalsAgainst = avg(awayMatches.map((m) => m.goalsAgainst));

  // Fall back to the team's overall average (home+away combined) when a
  // team doesn't have enough home-only or away-only matches yet -- better
  // than a null/NaN strength.
  const overallFor = avg(matches.map((m) => m.goalsFor)) ?? leagueAvg.avgHomeGoals;
  const overallAgainst = avg(matches.map((m) => m.goalsAgainst)) ?? leagueAvg.avgAwayGoals;

  return {
    attackHome: (homeGoalsFor ?? overallFor) / leagueAvg.avgHomeGoals,
    attackAway: (awayGoalsFor ?? overallFor) / leagueAvg.avgAwayGoals,
    defenseHome: (homeGoalsAgainst ?? overallAgainst) / leagueAvg.avgAwayGoals,
    defenseAway: (awayGoalsAgainst ?? overallAgainst) / leagueAvg.avgHomeGoals,
    sampleSize: matches.length,
  };
}

export function expectedGoals(
  home: TeamStrength,
  away: TeamStrength,
  leagueAvg: LeagueAverages = DEFAULT_LEAGUE_AVERAGES,
): { homeXg: number; awayXg: number } {
  return {
    homeXg: home.attackHome * away.defenseAway * leagueAvg.avgHomeGoals,
    awayXg: away.attackAway * home.defenseHome * leagueAvg.avgAwayGoals,
  };
}

function poissonPmf(lambda: number, k: number): number {
  // P(X = k) for a Poisson distribution with mean lambda.
  let result = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) result *= lambda / i;
  return result;
}

const MAX_GOALS = 8; // grid beyond this is negligible probability mass

export type ScorelineMatrix = number[][]; // matrix[home][away] = probability

export function buildScorelineMatrix(homeXg: number, awayXg: number): ScorelineMatrix {
  const matrix: ScorelineMatrix = [];
  for (let h = 0; h <= MAX_GOALS; h++) {
    const row: number[] = [];
    for (let a = 0; a <= MAX_GOALS; a++) {
      row.push(poissonPmf(homeXg, h) * poissonPmf(awayXg, a));
    }
    matrix.push(row);
  }
  return matrix;
}

export interface MarketProbabilities {
  homeWin: number;
  draw: number;
  awayWin: number;
  bttsYes: number;
  bttsNo: number;
  overUnder: Record<string, { over: number; under: number }>; // keyed by line, e.g. "2.5"
}

export function deriveMarketProbabilities(
  matrix: ScorelineMatrix,
  overUnderLines: number[] = [1.5, 2.5, 3.5],
): MarketProbabilities {
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  let bttsYes = 0;
  const overUnder: Record<string, { over: number; under: number }> = {};
  for (const line of overUnderLines) overUnder[line.toFixed(1)] = { over: 0, under: 0 };

  for (let h = 0; h < matrix.length; h++) {
    for (let a = 0; a < matrix[h].length; a++) {
      const p = matrix[h][a];
      if (h > a) homeWin += p;
      else if (h === a) draw += p;
      else awayWin += p;

      if (h > 0 && a > 0) bttsYes += p;

      const totalGoals = h + a;
      for (const line of overUnderLines) {
        const key = line.toFixed(1);
        if (totalGoals > line) overUnder[key].over += p;
        else overUnder[key].under += p;
      }
    }
  }

  return { homeWin, draw, awayWin, bttsYes, bttsNo: 1 - bttsYes, overUnder };
}

// Converts a raw model probability into a 0-100 confidence score.
// Floored/ceilinged rather than allowed to hit 0 or 100 -- football has
// irreducible uncertainty, and a model claiming absolute certainty is a
// red flag, not a feature.
const SCORE_FLOOR = 3;
const SCORE_CEILING = 97;

export function probabilityToScore(probability: number): number {
  const pct = probability * 100;
  return Math.round(Math.min(SCORE_CEILING, Math.max(SCORE_FLOOR, pct)));
}
