import { NextRequest, NextResponse } from 'next/server';
import { fetchMatchesByDateRange } from '@/lib/services/footballData';
import { computeMatchProbabilities, scoreForMarket, type MarketSelector } from '@/lib/services/confidenceEngine';
import { generateReason } from '@/lib/services/gemini';
import { generateDailyTickets, type CandidateSelection } from '@/lib/services/predictorSelection';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const maxDuration = 60; // this job does real work; use the full serverless budget

// The markets scanned for every fixture. Keep this list bounded --
// football-data.org's free tier is limited, and every fixture we scan is
// 2 requests (home + away form) regardless of how many markets we derive
// from that one fetch, so the market list itself doesn't add API cost,
// only compute (cheap).
const CANDIDATE_MARKETS: MarketSelector[] = [
  { type: '1X2', pick: 'home' },
  { type: '1X2', pick: 'draw' },
  { type: '1X2', pick: 'away' },
  { type: 'BTTS', pick: 'yes' },
  { type: 'OVER_UNDER', pick: 'over', line: 2.5 },
  { type: 'OVER_UNDER', pick: 'under', line: 2.5 },
];

const FIXTURE_WINDOW_DAYS = 2; // scan the next 2 days of fixtures each run

// football-data.org free tier is 10 req/min, and each fixture costs 2
// requests (home + away form). Capping fixtures processed per run bounds
// both the API-call budget and this function's execution time -- on a
// heavy multi-competition day there may be more scheduled fixtures than
// this, and those simply aren't scanned that run rather than the job
// failing outright. That's an accepted free-tier limitation, not a bug.
//
// Cut down from 25->12 and throttle 300ms->100ms after a 502 on first
// live test: scanning many fixtures sequentially (2 API calls + a Gemini
// call per selection that makes a ticket, each with its own network
// round-trip) adds up fast in a single request/response cycle. Smaller
// and faster first, can raise again once there's a stable baseline for
// how long this actually takes end to end.
const MAX_FIXTURES_PER_RUN = 12;
const THROTTLE_MS = 100;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured yet -- allow, but this should be set before going live
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Top-level safety net: every known failure mode inside is already
  // caught individually (per-fixture, Gemini, Supabase), but this catches
  // anything unexpected so a bug here returns a diagnosable JSON error
  // instead of an opaque crash.
  try {
    return await runPredictorJob();
  } catch (err) {
    console.error('[predictor cron] unhandled error:', err);
    return NextResponse.json(
      { error: 'Unhandled error', message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

async function runPredictorJob(): Promise<NextResponse> {
  const startedAt = Date.now();
  const dateFrom = new Date().toISOString().slice(0, 10);
  const dateTo = new Date(Date.now() + FIXTURE_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);

  let fixtures;
  try {
    fixtures = await fetchMatchesByDateRange(dateFrom, dateTo);
  } catch (err) {
    console.error('[predictor cron] failed to fetch fixtures:', err);
    return NextResponse.json({ error: 'Failed to fetch fixtures' }, { status: 502 });
  }

  const scheduled = fixtures
    .filter((f) => f.status === 'SCHEDULED' || f.status === 'TIMED')
    .slice(0, MAX_FIXTURES_PER_RUN);

  // Build candidates WITHOUT reason text yet -- Gemini is only called
  // later, for the small subset of selections that actually make it into
  // a final ticket. Evaluating fixtures x 6 markets here is pure math, no
  // extra API cost beyond the 2 football-data.org calls per fixture.
  const candidates: CandidateSelection[] = [];
  let skippedCount = 0;

  for (const fixture of scheduled) {
    let outcome;
    try {
      outcome = await computeMatchProbabilities(fixture.homeTeam.id, fixture.awayTeam.id, [2.5]);
    } catch (err) {
      // One fixture erroring (rate limit, network blip, etc.) skips just
      // that fixture -- it must not take down the whole run.
      console.error('[predictor cron] fixture scoring failed, skipping:', fixture.id, err);
      skippedCount++;
      await sleep(THROTTLE_MS);
      continue;
    }

    if (outcome.status !== 'ok') {
      await sleep(THROTTLE_MS);
      continue; // insufficient data for this fixture -- skip, not an error
    }

    for (const market of CANDIDATE_MARKETS) {
      const scored = scoreForMarket(market, outcome.data.probs);
      if (!scored) continue;

      candidates.push({
        externalEventId: String(fixture.id),
        homeTeam: fixture.homeTeam.name,
        awayTeam: fixture.awayTeam.name,
        competition: fixture.competition.name,
        market:
          market.type === '1X2'
            ? `1X2 - ${market.pick}`
            : market.type === 'BTTS'
              ? 'BTTS - Yes'
              : `${market.pick === 'over' ? 'Over' : 'Under'} ${market.line}`,
        score: scored.score,
        modelOdds: Math.round((1 / scored.probability) * 100) / 100,
        reason: '', // filled in below, only for selections that make a final ticket
        kickoffAt: fixture.utcDate,
      });
    }

    await sleep(THROTTLE_MS);
  }

  const fixtureScanMs = Date.now() - startedAt;
  const tickets = generateDailyTickets(candidates);

  const reasonsStartedAt = Date.now();
  // Now generate reasons -- only for the selections actually used.
  for (const ticket of tickets) {
    for (const sel of ticket.selections) {
      sel.reason = await generateReason({
        homeTeam: sel.homeTeam,
        awayTeam: sel.awayTeam,
        market: sel.market,
        score: sel.score,
        homeForm: '', // form strings aren't retained per-candidate to avoid holding
        awayForm: '', // large state across ~30 fixtures; reason still has score+teams+market
        homeGoalsAvg: 0,
        awayGoalsAvg: 0,
      });
    }
  }

  const ticketDate = dateFrom;

  try {
    const admin = getSupabaseAdmin();

    // Replace today's tickets wholesale -- this cron runs once/day, so
    // there's no reason to accumulate multiple generations per date.
    const { data: existingTickets } = await admin
      .from('predictor_tickets')
      .select('id')
      .eq('ticket_date', ticketDate);

    if (existingTickets && existingTickets.length > 0) {
      await admin.from('predictor_tickets').delete().eq('ticket_date', ticketDate);
    }

    for (const ticket of tickets) {
      const { data: ticketRow, error } = await admin
        .from('predictor_tickets')
        .insert({
          ticket_date: ticketDate,
          target_band: ticket.targetBand,
          combined_odds: ticket.combinedOdds,
          avg_confidence: ticket.avgConfidence,
        })
        .select('id')
        .single();

      if (error || !ticketRow) continue;

      await admin.from('predictor_ticket_selections').insert(
        ticket.selections.map((s) => ({
          ticket_id: ticketRow.id,
          external_event_id: s.externalEventId,
          home_team: s.homeTeam,
          away_team: s.awayTeam,
          competition: s.competition,
          market: s.market,
          score: s.score,
          model_odds: s.modelOdds,
          reason: s.reason,
          kickoff_at: s.kickoffAt,
        })),
      );
    }
  } catch (err) {
    console.error('[predictor cron] Supabase persistence failed:', err);
    return NextResponse.json({ error: 'Generated tickets but failed to save them', tickets }, { status: 500 });
  }

  const reasonsMs = Date.now() - reasonsStartedAt;
  const totalMs = Date.now() - startedAt;

  return NextResponse.json({
    ticketDate,
    fixturesScanned: scheduled.length,
    fixturesSkipped: skippedCount,
    candidatesEvaluated: candidates.length,
    ticketsGenerated: tickets.length,
    timingMs: { fixtureScan: fixtureScanMs, reasonGeneration: reasonsMs, total: totalMs },
    tickets,
  });
}
