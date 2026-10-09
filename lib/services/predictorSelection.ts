// Daily AI Predictor selection algorithm. Given a pool of scored
// candidate selections (already computed by the Confidence Engine),
// builds up to 5 tickets -- one per target odds band (1.5/2/3/4/5) --
// by combining high-confidence selections until their combined odds land
// within tolerance of the target.
//
// ODDS: each candidate carries `odds` -- the price the ticket is built from.
// When the game came from a bookmaker's feed (SportyBet) that is the REAL
// bookmaker price (`oddsSource: 'bookmaker'`). When only fixtures were
// available (fallback), it is the model-implied fair odds, 1/probability from
// our Poisson model (`oddsSource: 'model'`), which won't match a platform's
// price. A ticket is only labelled 'bookmaker' if every leg is.

export interface CandidateSelection {
  externalEventId: string;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  market: string;
  score: number;      // 0-100, from the Confidence Engine
  modelOdds: number;   // 1 / probability
  probability?: number;   // model probability for the pick, 0-1
  odds: number;           // price the ticket is built from (see ODDS above)
  oddsSource: 'bookmaker' | 'model';
  bookName?: string;      // e.g. "SportyBet" when oddsSource is 'bookmaker'
  // Real inputs for the written analysis (shared per fixture).
  form?: { home: string; away: string; homeGoalsAvg: number; awayGoalsAvg: number };
  reason: string;
  kickoffAt: string | null;
}

export interface GeneratedTicket {
  targetBand: number;
  combinedOdds: number;
  avgConfidence: number;
  oddsBasis: 'bookmaker' | 'model';
  selections: CandidateSelection[];
}

const TARGET_BANDS = [1.5, 2, 3, 4, 5];
const TOLERANCE = 0.15;       // combined odds must land within +/-15% of target
const MIN_CONFIDENCE = 60;    // confidence floor -- below this, not a "safe enough" pick
const MAX_POOL_SIZE = 40;     // cap search space so this stays fast in a serverless function
const MAX_LEGS = 6;           // a ticket shouldn't need more than this to hit odds 5.0 at reasonable confidence

// Bounded depth-first search: tries combinations of the highest-confidence
// candidates first, stops exploring a branch once it overshoots the
// target band, and never reuses a fixture within one ticket (avoids
// correlated selections from the same match).
const signature = (sels: CandidateSelection[]) =>
  sels.map((x) => `${x.externalEventId}|${x.market}`).sort().join('~');

// `taken` holds tickets already published for other bands: adjacent bands'
// odds windows overlap, and showing the same ticket twice isn't useful.
function buildTicketForBand(pool: CandidateSelection[], target: number, taken: Set<string> = new Set()): GeneratedTicket | null {
  const lower = target * (1 - TOLERANCE);
  const upper = target * (1 + TOLERANCE);
  const overshootCutoff = target * (1 + TOLERANCE) * 1.6; // prune well past the tolerance window

  let best: { selections: CandidateSelection[]; odds: number; avgScore: number } | null = null;

  function search(startIdx: number, used: Set<string>, odds: number, chosen: CandidateSelection[], scoreSum: number) {
    if (chosen.length > 0 && odds >= lower && odds <= upper && !taken.has(signature(chosen))) {
      const avgScore = scoreSum / chosen.length;
      if (!best || avgScore > best.avgScore) {
        best = { selections: [...chosen], odds, avgScore };
      }
    }

    if (odds > overshootCutoff || chosen.length >= MAX_LEGS || startIdx >= pool.length) return;

    for (let i = startIdx; i < pool.length; i++) {
      const c = pool[i];
      if (used.has(c.externalEventId)) continue;

      const newOdds = odds * c.odds;
      if (newOdds > overshootCutoff) continue;

      used.add(c.externalEventId);
      search(i + 1, used, newOdds, [...chosen, c], scoreSum + c.score);
      used.delete(c.externalEventId);
    }
  }

  search(0, new Set(), 1, [], 0);

  if (!best) return null;
  const b = best as { selections: CandidateSelection[]; odds: number; avgScore: number };
  return {
    targetBand: target,
    combinedOdds: b.odds,
    avgConfidence: b.avgScore,
    oddsBasis: b.selections.every((x) => x.oddsSource === 'bookmaker') ? 'bookmaker' : 'model',
    selections: b.selections,
  };
}

export function generateDailyTickets(candidates: CandidateSelection[]): GeneratedTicket[] {
  const pool = candidates
    .filter((c) => c.score >= MIN_CONFIDENCE)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_POOL_SIZE);

  const tickets: GeneratedTicket[] = [];
  const taken = new Set<string>();
  for (const band of TARGET_BANDS) {
    const ticket = buildTicketForBand(pool, band, taken);
    if (ticket) {
      tickets.push(ticket);
      taken.add(signature(ticket.selections));
    }
    // A band with no valid combination is simply skipped -- a light
    // fixture day publishing fewer than 5 tickets is expected behavior,
    // per the product spec's edge-case handling, not an error.
  }
  return tickets;
}
