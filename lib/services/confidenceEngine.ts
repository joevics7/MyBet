// Confidence Engine -- platform-agnostic. Takes a fixture + market,
// returns a 0-100 score + a one-line reason. This is the orchestrator:
// football-data.org for team form -> poissonModel.ts for the actual
// probability math -> gemini.ts for the human-readable reason.
//
// NOT YET WIRED to the Decoder: matching a decoded selection's team
// names (from SportyBet/Bet9ja) to football-data.org's team IDs is a
// separate, unsolved problem (no shared ID between a betting platform
// and a stats provider) -- this engine currently expects the caller to
// already have resolved football-data.org team IDs.

import { fetchTeamRecentForm } from './footballData';
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
}

export interface ConfidenceScoreResult {
  score: number;
  probability: number;
  reason: string;
  computedAt: string;
}

export type ConfidenceEngineResult =
  | { status: 'ok'; result: ConfidenceScoreResult }
  | { status: 'insufficient_data'; message: string };

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

export async function computeConfidenceScore(input: ConfidenceScoreInput): Promise<ConfidenceEngineResult> {
  const [homeForm, awayForm] = await Promise.all([
    fetchTeamRecentForm(input.homeTeamId),
    fetchTeamRecentForm(input.awayTeamId),
  ]);

  if (homeForm.length < MIN_SAMPLE_SIZE || awayForm.length < MIN_SAMPLE_SIZE) {
    return {
      status: 'insufficient_data',
      message: `Not enough recent match data (need ${MIN_SAMPLE_SIZE}+ games each; got ${homeForm.length}/${awayForm.length}).`,
    };
  }

  const leagueAvg = input.leagueAvg;
  const homeStrength = computeTeamStrength(homeForm, leagueAvg);
  const awayStrength = computeTeamStrength(awayForm, leagueAvg);
  const { homeXg, awayXg } = expectedGoals(homeStrength, awayStrength, leagueAvg);
  const matrix = buildScorelineMatrix(homeXg, awayXg);
  const probs = deriveMarketProbabilities(
    matrix,
    input.market.type === 'OVER_UNDER' ? [input.market.line] : undefined,
  );

  const probability = pickProbability(input.market, probs);
  if (probability === null) {
    return { status: 'insufficient_data', message: `Market line not computed: ${marketLabel(input.market)}` };
  }

  const score = probabilityToScore(probability);
  const reason = await generateReason({
    homeTeam: input.homeTeamName,
    awayTeam: input.awayTeamName,
    market: marketLabel(input.market),
    score,
    homeForm: formString(homeForm),
    awayForm: formString(awayForm),
    homeGoalsAvg: goalsAvg(homeForm),
    awayGoalsAvg: goalsAvg(awayForm),
  });

  return {
    status: 'ok',
    result: { score, probability, reason, computedAt: new Date().toISOString() },
  };
}
