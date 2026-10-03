// Bet Splitter logic -- groups a decoded slip's selections into sub-slips
// by one of three modes. Pure function, no I/O: the caller is responsible
// for attaching confidence scores to selections before calling this (see
// the /api/splitter route), since fetching those involves the Confidence
// Engine and the team-matching coverage gaps documented there.

export interface SplittableSelection {
  externalEventId: string;
  homeTeam: string;
  awayTeam: string;
  market: string;
  odds: number;
  score: number | null; // null when the Confidence Engine couldn't cover this fixture
  // Raw platform fields, carried through so a split group can actually be
  // re-encoded into a new booking code -- see NormalizedSelection in types.ts.
  rawMarketId?: string;
  rawOutcomeId?: string;
  rawSpecifier?: string;
}

export interface SplitGroup {
  label: string;
  selections: SplittableSelection[];
}

export type SplitMode = 'risk' | 'even' | 'market';

// Parses a decoded selection's free-text market label (e.g. "1X2 - Draw",
// "Over 2.5") back into a MarketSelector the Confidence Engine can score.
// IMPORTANT: only confirmed against real captured SportyBet data for the
// "1X2 - Draw" case (see sportybet.ts's decode service and the real
// example in this project's history) -- we have NOT yet captured a real
// Home/Away, BTTS, or Over/Under selection from SportyBet to confirm its
// exact outcome.desc wording for those. Returns null (safe) rather than
// guessing for anything not confirmed -- an ungraded selection in the
// Splitter is honest; a wrongly-scored one isn't.
export function parseMarketString(
  market: string,
  homeTeam: string,
  awayTeam: string,
): { type: '1X2'; pick: 'home' | 'draw' | 'away' } | { type: 'OVER_UNDER'; pick: 'over' | 'under'; line: number } | { type: 'BTTS'; pick: 'yes' | 'no' } | null {
  const lower = market.toLowerCase();

  if (lower.includes('1x2')) {
    if (lower.includes('draw')) return { type: '1X2', pick: 'draw' };
    if (lower.includes(homeTeam.toLowerCase()) || lower.endsWith('- home') || lower.endsWith('- 1')) {
      return { type: '1X2', pick: 'home' };
    }
    if (lower.includes(awayTeam.toLowerCase()) || lower.endsWith('- away') || lower.endsWith('- 2')) {
      return { type: '1X2', pick: 'away' };
    }
    return null; // 1X2 but couldn't confidently tell which side -- don't guess
  }

  const ouMatch = lower.match(/(over|under)[^\d]*(\d+(\.\d+)?)/);
  if (ouMatch) {
    return { type: 'OVER_UNDER', pick: ouMatch[1] as 'over' | 'under', line: parseFloat(ouMatch[2]) };
  }

  if (lower.includes('btts') || lower.includes('both teams to score')) {
    if (lower.includes('yes')) return { type: 'BTTS', pick: 'yes' };
    if (lower.includes('no')) return { type: 'BTTS', pick: 'no' };
  }

  return null;
}

const RISK_TIERS = [
  { label: 'Safe', min: 70 },
  { label: 'Medium', min: 40 },
  { label: 'Risky', min: 0 },
] as const;

function splitByRisk(selections: SplittableSelection[]): SplitGroup[] {
  const tiers: Record<string, SplittableSelection[]> = { Safe: [], Medium: [], Risky: [], Ungraded: [] };

  for (const sel of selections) {
    if (sel.score === null) {
      tiers.Ungraded.push(sel);
      continue;
    }
    const tier = RISK_TIERS.find((t) => sel.score! >= t.min) ?? RISK_TIERS[RISK_TIERS.length - 1];
    tiers[tier.label].push(sel);
  }

  return Object.entries(tiers)
    .filter(([, sels]) => sels.length > 0)
    .map(([label, sels]) => ({ label, selections: sels }));
}

function splitEvenly(selections: SplittableSelection[], groupCount: number): SplitGroup[] {
  const groups: SplitGroup[] = Array.from({ length: groupCount }, (_, i) => ({
    label: `Slip ${i + 1}`,
    selections: [],
  }));
  selections.forEach((sel, i) => groups[i % groupCount].selections.push(sel));
  return groups.filter((g) => g.selections.length > 0);
}

function splitByMarket(selections: SplittableSelection[]): SplitGroup[] {
  const byMarket = new Map<string, SplittableSelection[]>();
  for (const sel of selections) {
    const key = sel.market;
    if (!byMarket.has(key)) byMarket.set(key, []);
    byMarket.get(key)!.push(sel);
  }
  return Array.from(byMarket.entries()).map(([market, sels]) => ({ label: market, selections: sels }));
}

export function splitSelections(
  selections: SplittableSelection[],
  mode: SplitMode,
  groupCount = 2,
): SplitGroup[] {
  if (mode === 'risk') return splitByRisk(selections);
  if (mode === 'market') return splitByMarket(selections);
  return splitEvenly(selections, groupCount);
}
