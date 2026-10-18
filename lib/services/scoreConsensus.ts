// Score-consensus engine -- turns whatever tipster sources are available for a match (1 to 4) into
// ONE expected scoreline, then derives every market from it. Pure functions, no I/O.
//
// HOW IT WORKS
//   1. Each source becomes an "expectation" = how many goals it expects each team to score:
//        PredictZ, Vitibet, SoccerTips  -> their predicted score IS the expectation (kind 'score')
//        Statarea                       -> publishes percentages, not a score, so we FIT the goal
//                                          pair (home, away) whose Poisson model reproduces its
//                                          1X2 / Over 1.5-2.5-3.5 / BTTS percentages (kind 'fitted')
//   2. The expectations are averaged (weighted, all 1.0 for now) into one expected-goals pair.
//   3. That pair feeds a Poisson scoreline grid, and every market is the sum of the grid cells that
//      satisfy it. All markets therefore come from the same numbers and can never contradict each other
//      (e.g. Over 2.5 can't be more likely than Over 1.5).
//   4. Alongside each probability we report AGREEMENT: how many of the sources that gave a real score
//      have a scoreline that itself satisfies the pick. Probability says "how likely given the average";
//      agreement says "how many sites actually back it". 1 source = agreement of 1/1, so read the two
//      together with `sourcesUsed`.
//
// KNOWN LIMITATIONS (worth remembering when reading the numbers)
//   - A tipster's predicted score is a "most likely scoreline", which tends to sit a bit BELOW the true
//     average goals (modal score < mean). If Overs look systematically low against real results, raise
//     GOALS_SCALE slightly after backtesting; it is 1.0 (no adjustment) until there is data to justify it.
//   - Poisson assumes the two teams' goals are independent; real football has a small correlation.
//   - SoccerTips fills many lower-league games with default-looking scores; SOURCE_WEIGHTS lets it
//     count for less without code changes elsewhere.

import { buildScorelineMatrix, probabilityToScore, type ScorelineMatrix } from './poissonModel';
import type { MarketSelector } from './confidenceEngine';
import type { StatareaPrediction } from './statarea';

export type TipsterSourceName = 'predictz' | 'vitibet' | 'soccertips' | 'statarea';

export interface SourceExpectation {
  source: TipsterSourceName;
  home: number; // expected home goals (an integer for kind 'score', fractional for 'fitted')
  away: number;
  kind: 'score' | 'fitted';
}

export const SOURCE_WEIGHTS: Record<TipsterSourceName, number> = {
  predictz: 1,
  vitibet: 1,
  soccertips: 1,
  statarea: 1,
};

const GOALS_SCALE = 1.0;
const MIN_LAMBDA = 0.2; // a source predicting 0 goals must not make "scores 0" a 100% certainty
const MAX_LAMBDA = 5.0;

// ---------------------------------------------------------------- building expectations

export function expectationFromScore(source: TipsterSourceName, home: number, away: number): SourceExpectation | null {
  if (!Number.isFinite(home) || !Number.isFinite(away) || home < 0 || away < 0) return null;
  return { source, home, away, kind: 'score' };
}

function pmfArray(lambda: number, n: number): number[] {
  const out: number[] = [];
  let p = Math.exp(-lambda);
  out.push(p);
  for (let k = 1; k <= n; k++) {
    p *= lambda / k;
    out.push(p);
  }
  return out;
}

// [P(home), P(draw), P(away), P(over1.5), P(over2.5), P(over3.5), P(btts)] for independent Poisson goals.
function modelPoint(lh: number, la: number): number[] {
  const N = 10;
  const ph = pmfArray(lh, N);
  const pa = pmfArray(la, N);
  let h = 0, d = 0, a = 0, o15 = 0, o25 = 0, o35 = 0;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const p = ph[i] * pa[j];
      if (i > j) h += p;
      else if (i === j) d += p;
      else a += p;
      const t = i + j;
      if (t > 1.5) o15 += p;
      if (t > 2.5) o25 += p;
      if (t > 3.5) o35 += p;
    }
  }
  return [h, d, a, o15, o25, o35, (1 - ph[0]) * (1 - pa[0])];
}

// Finds the (home, away) goal pair whose Poisson model best reproduces Statarea's percentages
// (least squares over 1X2, the three Over lines and BTTS-yes). Coarse grid, then a fine grid around the best.
export function fitExpectedGoalsFromStatarea(p: StatareaPrediction): { home: number; away: number } | null {
  const sum1x2 = p.homeWinPercent + p.drawPercent + p.awayWinPercent;
  if (sum1x2 < 90 || sum1x2 > 110) return null; // missing / not a real 1X2 triple

  const targets: { idx: number; value: number }[] = [
    { idx: 0, value: p.homeWinPercent / sum1x2 },
    { idx: 1, value: p.drawPercent / sum1x2 },
    { idx: 2, value: p.awayWinPercent / sum1x2 },
  ];
  // The cache stores a missing value as 0; a real Over 1.5/2.5/3.5 or BTTS is never exactly 0%.
  if (p.over15Percent > 0) targets.push({ idx: 3, value: p.over15Percent / 100 });
  if (p.over25Percent > 0) targets.push({ idx: 4, value: p.over25Percent / 100 });
  if (p.over35Percent > 0) targets.push({ idx: 5, value: p.over35Percent / 100 });
  if (p.bttsYesPercent > 0) targets.push({ idx: 6, value: p.bttsYesPercent / 100 });

  const loss = (lh: number, la: number) => {
    const m = modelPoint(lh, la);
    let s = 0;
    for (const t of targets) s += (m[t.idx] - t.value) ** 2;
    return s;
  };

  let best = { lh: 1.4, la: 1.1, l: Infinity };
  for (let lh = 0.2; lh <= 4.2; lh += 0.2) {
    for (let la = 0.2; la <= 4.2; la += 0.2) {
      const l = loss(lh, la);
      if (l < best.l) best = { lh, la, l };
    }
  }
  const center = best;
  for (let lh = Math.max(0.1, center.lh - 0.2); lh <= center.lh + 0.2; lh += 0.02) {
    for (let la = Math.max(0.1, center.la - 0.2); la <= center.la + 0.2; la += 0.02) {
      const l = loss(lh, la);
      if (l < best.l) best = { lh, la, l };
    }
  }
  return { home: Math.round(best.lh * 100) / 100, away: Math.round(best.la * 100) / 100 };
}

export function expectationFromStatarea(p: StatareaPrediction): SourceExpectation | null {
  const fit = fitExpectedGoalsFromStatarea(p);
  return fit ? { source: 'statarea', home: fit.home, away: fit.away, kind: 'fitted' } : null;
}

// ---------------------------------------------------------------- combining

export function combineExpectations(list: SourceExpectation[]): { home: number; away: number } | null {
  if (list.length === 0) return null;
  let wSum = 0, h = 0, a = 0;
  for (const e of list) {
    const w = SOURCE_WEIGHTS[e.source] ?? 1;
    wSum += w;
    h += e.home * w;
    a += e.away * w;
  }
  const clamp = (x: number) => Math.min(MAX_LAMBDA, Math.max(MIN_LAMBDA, x * GOALS_SCALE));
  return { home: clamp(h / wSum), away: clamp(a / wSum) };
}

// ---------------------------------------------------------------- market definitions

type Test = (h: number, a: number) => boolean;
interface OutcomeDef { key: string; label: string; test: Test }
interface GroupDef { id: string; name: string; outcomes: OutcomeDef[] }

const lineId = (line: number) => String(line).replace('.', '_');

function overUnderGroup(id: string, name: string, line: number, goals: (h: number, a: number) => number): GroupDef {
  return {
    id,
    name,
    outcomes: [
      { key: 'over', label: `Over ${line}`, test: (h, a) => goals(h, a) > line },
      { key: 'under', label: `Under ${line}`, test: (h, a) => goals(h, a) < line },
    ],
  };
}

function buildGroupDefs(): GroupDef[] {
  const groups: GroupDef[] = [];

  for (const line of [0.5, 1.5, 2.5, 3.5]) {
    groups.push(overUnderGroup(`over_under_${lineId(line)}`, `Over/Under ${line}`, line, (h, a) => h + a));
  }

  groups.push({
    id: 'both_teams_to_score',
    name: 'Both Teams to Score',
    outcomes: [
      { key: 'gg', label: 'GG (Yes)', test: (h, a) => h > 0 && a > 0 },
      { key: 'ng', label: 'NG (No)', test: (h, a) => h === 0 || a === 0 },
    ],
  });

  groups.push({
    id: 'match_result',
    name: 'Match Result (1X2)',
    outcomes: [
      { key: 'home', label: '1 (Home)', test: (h, a) => h > a },
      { key: 'draw', label: 'X (Draw)', test: (h, a) => h === a },
      { key: 'away', label: '2 (Away)', test: (h, a) => h < a },
    ],
  });

  groups.push({
    id: 'double_chance',
    name: 'Double Chance',
    outcomes: [
      { key: '1x', label: '1X (Home or Draw)', test: (h, a) => h >= a },
      { key: '12', label: '12 (Home or Away)', test: (h, a) => h !== a },
      { key: 'x2', label: 'X2 (Draw or Away)', test: (h, a) => h <= a },
    ],
  });

  groups.push({
    id: 'odd_even',
    name: 'Odd/Even Total Goals',
    outcomes: [
      { key: 'odd', label: 'Odd', test: (h, a) => (h + a) % 2 === 1 },
      { key: 'even', label: 'Even', test: (h, a) => (h + a) % 2 === 0 },
    ],
  });

  for (const line of [0.5, 1.5, 2.5]) {
    groups.push(overUnderGroup(`home_over_under_${lineId(line)}`, `Home Team Over/Under ${line}`, line, (h) => h));
  }
  for (const line of [0.5, 1.5, 2.5]) {
    groups.push(overUnderGroup(`away_over_under_${lineId(line)}`, `Away Team Over/Under ${line}`, line, (_h, a) => a));
  }

  // Winning margin: the standard bookmaker split. Every scoreline falls in exactly one outcome.
  groups.push({
    id: 'winning_margin',
    name: 'Winning Margin',
    outcomes: [
      { key: 'home_by_1', label: 'Home by 1', test: (h, a) => h - a === 1 },
      { key: 'home_by_2', label: 'Home by 2', test: (h, a) => h - a === 2 },
      { key: 'home_by_3_plus', label: 'Home by 3+', test: (h, a) => h - a >= 3 },
      { key: 'away_by_1', label: 'Away by 1', test: (h, a) => a - h === 1 },
      { key: 'away_by_2', label: 'Away by 2', test: (h, a) => a - h === 2 },
      { key: 'away_by_3_plus', label: 'Away by 3+', test: (h, a) => a - h >= 3 },
      { key: 'score_draw', label: 'Score draw', test: (h, a) => h === a && h > 0 },
      { key: 'no_goal', label: 'No goal (0-0)', test: (h, a) => h === 0 && a === 0 },
    ],
  });

  // Not mutually exclusive (both can't happen at once, but neither is the "opposite" of the other) -- each is its own yes-bet.
  groups.push({
    id: 'win_to_nil',
    name: 'Win to Nil',
    outcomes: [
      { key: 'home_win_to_nil', label: 'Home win to nil', test: (h, a) => h > a && a === 0 },
      { key: 'away_win_to_nil', label: 'Away win to nil', test: (h, a) => a > h && h === 0 },
    ],
  });

  return groups;
}

const GROUP_DEFS = buildGroupDefs();

// ---------------------------------------------------------------- output

export interface OutcomeResult {
  key: string;
  label: string;
  probability: number; // 0-1, from the averaged expected goals
  score: number; // 0-100 (probability, floored at 3 / capped at 97 like the rest of the app)
  agreement: { agree: number; of: number }; // sources with a real predicted score whose own scoreline satisfies this outcome
}

export interface GroupResult {
  id: string;
  name: string;
  outcomes: OutcomeResult[];
}

export interface ConsensusMarkets {
  sourcesUsed: TipsterSourceName[];
  perSource: SourceExpectation[];
  expectedGoals: { home: number; away: number };
  groups: GroupResult[];
}

function normalizedMatrix(lh: number, la: number): ScorelineMatrix {
  const m = buildScorelineMatrix(lh, la);
  let total = 0;
  for (const row of m) for (const p of row) total += p;
  return total > 0 ? m.map((row) => row.map((p) => p / total)) : m;
}

export function buildConsensusMarkets(expectations: SourceExpectation[]): ConsensusMarkets | null {
  const eg = combineExpectations(expectations);
  if (!eg) return null;

  const matrix = normalizedMatrix(eg.home, eg.away);
  const scoreSources = expectations.filter((e) => e.kind === 'score');

  const groups: GroupResult[] = GROUP_DEFS.map((g) => ({
    id: g.id,
    name: g.name,
    outcomes: g.outcomes.map((o) => {
      let probability = 0;
      for (let h = 0; h < matrix.length; h++) {
        for (let a = 0; a < matrix[h].length; a++) {
          if (o.test(h, a)) probability += matrix[h][a];
        }
      }
      const agree = scoreSources.filter((e) => o.test(Math.round(e.home), Math.round(e.away))).length;
      return {
        key: o.key,
        label: o.label,
        probability: Math.round(probability * 10000) / 10000,
        score: probabilityToScore(probability),
        agreement: { agree, of: scoreSources.length },
      };
    }),
  }));

  return {
    sourcesUsed: expectations.map((e) => e.source),
    perSource: expectations,
    expectedGoals: { home: Math.round(eg.home * 100) / 100, away: Math.round(eg.away * 100) / 100 },
    groups,
  };
}

// Probability of an arbitrary MarketSelector (any Over/Under line, not just the four listed above) from the
// averaged expected goals -- used by the decode flow's existing single-market tipster score.
export function selectorProbability(expectations: SourceExpectation[], market: MarketSelector): number | null {
  const eg = combineExpectations(expectations);
  if (!eg) return null;
  const matrix = normalizedMatrix(eg.home, eg.away);
  let p = 0;
  for (let h = 0; h < matrix.length; h++) {
    for (let a = 0; a < matrix[h].length; a++) {
      let hit: boolean;
      if (market.type === '1X2') hit = market.pick === 'home' ? h > a : market.pick === 'draw' ? h === a : h < a;
      else if (market.type === 'BTTS') hit = (h > 0 && a > 0) === (market.pick === 'yes');
      else hit = market.pick === 'over' ? h + a > market.line : h + a < market.line;
      if (hit) p += matrix[h][a];
    }
  }
  return p;
}
