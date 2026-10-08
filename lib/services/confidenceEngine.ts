// Confidence Engine -- platform-agnostic. Takes a fixture + market,
// returns a 0-100 score + a one-line reason. This is the orchestrator:
// football-data.org for team form -> poissonModel.ts for the actual
// probability math -> gemini.ts for the human-readable reason.
//
// Two entry points:
// - computeConfidenceScoreFromNames(): the one a decoded selection should
//   use. Resolves team names to a football-data.org fixture via
//   teamMatcher.ts first, then scores it. Can return 'not_covered' when
//   the fixture isn't in football-data.org's free-tier competitions --
//   expected to be common, not an error.
// - computeConfidenceScore(): lower-level, ID-based, used internally once
//   teams are already resolved (or callable directly if a caller already
//   has football-data.org team IDs from elsewhere).
//
// STILL NOT WIRED to the Decoder UI itself -- this module is ready to
// call, but /tools/decoder doesn't call it yet.

import { fetchTeamRecentForm as fdForm } from './footballData';
import { fetchTeamRecentForm as afForm } from './apiFootball';
import type { FixtureProvider } from './teamMatcher';
import { findFixtureByTeamNames, type MatchedFixture } from './teamMatcher';
import {
  computeTeamStrength,
  expectedGoals,
  buildScorelineMatrix,
  deriveMarketProbabilities,
  probabilityToScore,
  MIN_SAMPLE_SIZE,
  type LeagueAverages,
  type TeamMatchResult,
} from './poissonModel';
import { generateReason } from './gemini';

export type MarketSelector =
  | { type: '1X2'; pick: 'home' | 'draw' | 'away' }
  | { type: 'OVER_UNDER'; pick: 'over' | 'under'; line: number }
  | { type: 'BTTS'; pick: 'yes' | 'no' };

export interface ConfidenceScoreInput {
  homeTeamId: number;
  awayTeamId: number;
  homeTeamName: string;
  awayTeamName: string;
  market: MarketSelector;
  leagueAvg?: LeagueAverages;
  provider?: FixtureProvider; // which provider the team IDs belong to (default football-data)
}

export interface ConfidenceScoreResult {
  score: number;
  probability: number;
  reason: string;
  computedAt: string;
}

// ID-based outcome -- used internally once teams are already resolved.
export type ScoreOutcome =
  | { status: 'ok'; result: ConfidenceScoreResult }
  | { status: 'insufficient_data'; message: string };

// Name-based outcome -- the public entry point, used by callers (like a
// decoded selection) that only have team names, not football-data.org IDs.
export type ConfidenceEngineResult =
  | { status: 'ok'; result: ConfidenceScoreResult; matchedFixture: MatchedFixture }
  | { status: 'insufficient_data'; message: string }
  | { status: 'not_covered'; message: string };

function formString(matches: TeamMatchResult[]): string {
  // Most recent last, matching how form is conventionally displayed.
  return [...matches]
    .reverse()
    .map((m) => (m.goalsFor > m.goalsAgainst ? 'W' : m.goalsFor === m.goalsAgainst ? 'D' : 'L'))
    .join('-');
}

function goalsAvg(matches: TeamMatchResult[]): number {
  if (matches.length === 0) return 0;
  return matches.reduce((sum, m) => sum + m.goalsFor, 0) / matches.length;
}

export function marketLabel(market: MarketSelector): string {
  if (market.type === '1X2') return `1X2 - ${market.pick}`;
  if (market.type === 'OVER_UNDER') return `${market.pick === 'over' ? 'Over' : 'Under'} ${market.line}`;
  return `BTTS - ${market.pick === 'yes' ? 'Yes' : 'No'}`;
}

function pickProbability(
  market: MarketSelector,
  probs: ReturnType<typeof deriveMarketProbabilities>,
): number | null {
  if (market.type === '1X2') {
    return market.pick === 'home' ? probs.homeWin : market.pick === 'draw' ? probs.draw : probs.awayWin;
  }
  if (market.type === 'BTTS') {
    return market.pick === 'yes' ? probs.bttsYes : probs.bttsNo;
  }
  const line = probs.overUnder[market.line.toFixed(1)];
  if (!line) return null; // line wasn't in the computed set
  return market.pick === 'over' ? line.over : line.under;
}

export interface MatchProbabilitiesData {
  probs: ReturnType<typeof deriveMarketProbabilities>;
  homeFormString: string;
  awayFormString: string;
  homeGoalsAvg: number;
  awayGoalsAvg: number;
}

export type MatchProbabilitiesOutcome =
  | { status: 'ok'; data: MatchProbabilitiesData }
  | { status: 'insufficient_data'; message: string };

// Fetches each team's form ONCE and derives probabilities for every
// requested market from a single Poisson matrix. Use this (not
// computeConfidenceScore in a loop) whenever scoring multiple markets
// for the same fixture -- e.g. the daily Predictor scanning 1X2/BTTS/O-U
// per match -- so football-data.org's 10 req/min limit isn't burned
// re-fetching the same team's form once per market.
export async function computeMatchProbabilities(
  homeTeamId: number,
  awayTeamId: number,
  overUnderLines: number[] = [1.5, 2.5, 3.5],
  leagueAvg?: LeagueAverages,
  provider: FixtureProvider = 'footballdata',
): Promise<MatchProbabilitiesOutcome> {
  const fetchForm = provider === 'apifootball' ? afForm : fdForm;
  const [homeForm, awayForm] = await Promise.all([fetchForm(homeTeamId), fetchForm(awayTeamId)]);

  if (homeForm.length < MIN_SAMPLE_SIZE || awayForm.length < MIN_SAMPLE_SIZE) {
    return {
      status: 'insufficient_data',
      message: `Not enough recent match data (need ${MIN_SAMPLE_SIZE}+ games each; got ${homeForm.length}/${awayForm.length}).`,
    };
  }

  const homeStrength = computeTeamStrength(homeForm, leagueAvg);
  const awayStrength = computeTeamStrength(awayForm, leagueAvg);
  const { homeXg, awayXg } = expectedGoals(homeStrength, awayStrength, leagueAvg);
  const matrix = buildScorelineMatrix(homeXg, awayXg);

  return {
    status: 'ok',
    data: {
      probs: deriveMarketProbabilities(matrix, overUnderLines),
      homeFormString: formString(homeForm),
      awayFormString: formString(awayForm),
      homeGoalsAvg: goalsAvg(homeForm),
      awayGoalsAvg: goalsAvg(awayForm),
    },
  };
}

// Cheap, no I/O -- just picks and converts a probability already computed
// by computeMatchProbabilities. No Gemini call here; callers that need a
// reason (like the Predictor, only for selections that make a final
// ticket) should call generateReason separately and only when needed.
export function scoreForMarket(
  market: MarketSelector,
  probs: ReturnType<typeof deriveMarketProbabilities>,
): { score: number; probability: number } | null {
  const probability = pickProbability(market, probs);
  if (probability === null) return null;
  return { score: probabilityToScore(probability), probability };
}

export async function computeConfidenceScore(input: ConfidenceScoreInput): Promise<ScoreOutcome> {
  const outcome = await computeMatchProbabilities(
    input.homeTeamId,
    input.awayTeamId,
    input.market.type === 'OVER_UNDER' ? [input.market.line] : undefined,
    input.leagueAvg,
    input.provider,
  );

  if (outcome.status === 'insufficient_data') return outcome;

  const scored = scoreForMarket(input.market, outcome.data.probs);
  if (!scored) {
    return { status: 'insufficient_data', message: `Market line not computed: ${marketLabel(input.market)}` };
  }

  const reason = await generateReason({
    homeTeam: input.homeTeamName,
    awayTeam: input.awayTeamName,
    market: marketLabel(input.market),
    score: scored.score,
    homeForm: outcome.data.homeFormString,
    awayForm: outcome.data.awayFormString,
    homeGoalsAvg: outcome.data.homeGoalsAvg,
    awayGoalsAvg: outcome.data.awayGoalsAvg,
  });

  return {
    status: 'ok',
    result: { score: scored.score, probability: scored.probability, reason, computedAt: new Date().toISOString() },
  };
}

export interface ConfidenceScoreFromNamesInput {
  homeTeamName: string;
  awayTeamName: string;
  kickoffAt: string | null;
  market: MarketSelector;
  leagueAvg?: LeagueAverages;
}

// The entry point a decoded selection should actually call -- resolves
// team names to a football-data.org fixture first (see teamMatcher.ts),
// then scores it. Returns 'not_covered' (not an error) when the fixture
// simply isn't in football-data.org's free-tier competitions, which is
// expected to be common -- see teamMatcher.ts's top comment.
export async function computeConfidenceScoreFromNames(
  input: ConfidenceScoreFromNamesInput,
): Promise<ConfidenceEngineResult> {
  const fixture = await findFixtureByTeamNames(input.homeTeamName, input.awayTeamName, input.kickoffAt);

  if (!fixture) {
    return {
      status: 'not_covered',
      message: 'No matching fixture found in our football data sources.',
    };
  }

  const outcome = await computeConfidenceScore({
    homeTeamId: fixture.homeTeamId,
    awayTeamId: fixture.awayTeamId,
    homeTeamName: fixture.homeTeamName,
    awayTeamName: fixture.awayTeamName,
    market: input.market,
    leagueAvg: input.leagueAvg,
    provider: fixture.provider,
  });

  if (outcome.status === 'insufficient_data') return outcome;
  return { status: 'ok', result: outcome.result, matchedFixture: fixture };
}
