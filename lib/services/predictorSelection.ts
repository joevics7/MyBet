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

// A booking code already created on a platform for one ticket.
export interface TicketCode {
  slug: string;
  label: string;
  code: string;
  deepLink: string | null;
  totalOdds: number | null; // the platform's own total for the code, read back after creating it
}

export interface CandidateSelection {
  externalEventId: string;
  // Stable id of the real match across both predictors (provider:matchId), so the same game is never used
  // on two tickets even when the bookmaker set and the model set name it differently.
  gameKey?: string;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  market: string;
  score: number;      // 0-100, from the Confidence Engine
  modelOdds: number;   // 1 / probability
  probability?: number;   // model probability for the pick, 0-1
  odds: number;           // price the ticket is built from (see ODDS above)
  oddsSource: 'bookmaker' | 'model';
  selector?: import('./confidenceEngine').MarketSelector; // lets the code creator find this pick on a platform
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
  bookingCodes: TicketCode[];
  selections: CandidateSelection[];
}

const TARGET_BANDS = [1.5, 2, 3, 4, 5];
const TOLERANCE = 0.15;       // combined odds must land within +/-15% of target
const MIN_CONFIDENCE = 60;    // a pick needs AT LEAST this confidence (0-100). Was 80 (stricter than the data supports: only 1-3 games a day cleared it)
const MAX_STRAIGHT_WINS_PER_TICKET = 1; // straight win = 1X2 home/away; capped so tickets are not all outright wins
const MAX_POOL_SIZE = 60;     // cap search space so this stays fast in a serverless function
const PICKS_PER_GAME = 3;     // only a game's best few markets enter the pool, so a handful of games can't crowd out all the others
const MAX_LEGS = 6;           // a ticket shouldn't need more than this to hit odds 5.0 at reasonable confidence

const gameOf = (c: CandidateSelection) => c.gameKey ?? c.externalEventId;

// Under-goals picks are never published. "Straight win" = a 1X2 home or away pick (a draw is not a win).
const isUnder = (c: CandidateSelection) => /^under\b/i.test(c.market);
const isStraightWin = (c: CandidateSelection) => /^1X2 - (home|away)\b/i.test(c.market);

// Bounded depth-first search: tries combinations of the highest-confidence
// candidates first, stops exploring a branch once it overshoots the
// target band, and never reuses a fixture within one ticket (avoids
// correlated selections from the same match).
const signature = (sels: CandidateSelection[]) =>
  sels.map((x) => `${x.externalEventId}|${x.market}`).sort().join('~');

// `taken` holds tickets already published for other bands: adjacent bands'
// odds windows overlap, and showing the same ticket twice isn't useful.
function buildTicketForBand(
  pool: CandidateSelection[],
  target: number,
  taken: Set<string> = new Set(),
  usedEvents: Set<string> = new Set(), // games already on another ticket today: never reused
): GeneratedTicket | null {
  const lower = target * (1 - TOLERANCE);
  const upper = target * (1 + TOLERANCE);
  const overshootCutoff = target * (1 + TOLERANCE) * 1.6; // prune well past the tolerance window

  let best: { selections: CandidateSelection[]; odds: number; avgScore: number } | null = null;

  function search(startIdx: number, used: Set<string>, odds: number, chosen: CandidateSelection[], scoreSum: number, wins = 0) {
    if (chosen.length > 0 && odds >= lower && odds <= upper && !taken.has(signature(chosen))) {
      const avgScore = scoreSum / chosen.length;
      if (!best || avgScore > best.avgScore) {
        best = { selections: [...chosen], odds, avgScore };
      }
    }

    if (odds > overshootCutoff || chosen.length >= MAX_LEGS || startIdx >= pool.length) return;

    for (let i = startIdx; i < pool.length; i++) {
      const c = pool[i];
      if (used.has(gameOf(c)) || usedEvents.has(gameOf(c))) continue;
      const win = isStraightWin(c) ? 1 : 0;
      if (wins + win > MAX_STRAIGHT_WINS_PER_TICKET) continue;

      const newOdds = odds * c.odds;
      if (newOdds > overshootCutoff) continue;

      used.add(gameOf(c));
      search(i + 1, used, newOdds, [...chosen, c], scoreSum + c.score, wins + win);
      used.delete(gameOf(c));
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
    bookingCodes: [],
    selections: b.selections,
  };
}

// `usedGames` is shared between the bookmaker run and the model run so no game appears on two tickets.
export function generateDailyTickets(candidates: CandidateSelection[], usedGames: Set<string> = new Set()): GeneratedTicket[] {
  const perGame = new Map<string, number>();
  const pool = candidates
    .filter((c) => c.score >= MIN_CONFIDENCE && !isUnder(c))
    .sort((a, b) => b.score - a.score)
    .filter((c) => {
      const n = perGame.get(gameOf(c)) ?? 0;
      perGame.set(gameOf(c), n + 1);
      return n < PICKS_PER_GAME;
    })
    .slice(0, MAX_POOL_SIZE);

  const tickets: GeneratedTicket[] = [];
  const taken = new Set<string>();
  const usedEvents = usedGames; // each game appears on at most ONE ticket, across all bands and both predictors
  for (const band of TARGET_BANDS) {
    const ticket = buildTicketForBand(pool, band, taken, usedEvents);
    if (ticket) {
      tickets.push(ticket);
      taken.add(signature(ticket.selections));
      ticket.selections.forEach((x) => usedEvents.add(gameOf(x)));
    }
    // A band with no valid combination is simply skipped -- a light
    // fixture day publishing fewer than 5 tickets is expected behavior,
    // per the product spec's edge-case handling, not an error.
  }
  return tickets;
}
