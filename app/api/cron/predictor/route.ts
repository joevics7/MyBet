// OPERATING NOTES -- Daily AI Predictor
// - Runs ONCE a day. The trigger is cron-job.org (not Vercel Cron):
//     GET https://<your-domain>/api/cron/predictor
//     header  Authorization: Bearer <CRON_SECRET>      (set CRON_SECRET in Vercel)
//   cron-job.org drops a request after ~30s, so by default this route replies
//   202 immediately and finishes the job in the background (waitUntil).
//   Add ?wait=1 to run it in the foreground and get the full JSON report
//   (use that for manual testing).
// - Game details are fetched ONCE per run (the day's games + odds from the
//   SportyBet feed, team form from API-Football) and every prediction/ticket is
//   calculated from that single fetch, then stored in predictor_tickets.
//   Visitors only ever read the stored tickets; nothing is fetched per visit.
// - Re-running the same day replaces that day's tickets.
import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { generateReason } from '@/lib/services/gemini';
import { generateDailyTickets, type CandidateSelection, type GeneratedTicket } from '@/lib/services/predictorSelection';
import { collectCandidates } from '@/lib/predictor/candidates';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const maxDuration = 60; // this job does real work; use the full serverless budget

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  // In production the endpoint is public (cron-job.org calls it), so a secret is
  // REQUIRED: without one it refuses to run. Locally it stays open for testing.
  if (!secret) return process.env.NODE_ENV !== 'production';
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Foreground run (manual testing): full JSON report, errors returned to the caller.
  if (req.nextUrl.searchParams.get('wait') === '1') {
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

  // Normal run: answer cron-job.org right away, finish in the background.
  // Results/errors go to the Vercel function logs ("[predictor cron] ...").
  waitUntil(
    runPredictorJob()
      .then((res) => console.log('[predictor cron] finished, HTTP', res.status))
      .catch((err) => console.error('[predictor cron] unhandled error:', err)),
  );
  return NextResponse.json({ status: 'started', note: 'Running in the background. Add ?wait=1 to run in the foreground and see the report.' }, { status: 202 });
}

// One analysis per unique pick: the same selection often appears in several tickets.
async function writeAnalysis(tickets: GeneratedTicket[]) {
  const unique = new Map<string, CandidateSelection[]>();
  for (const t of tickets) {
    for (const s of t.selections) {
      const key = `${s.externalEventId}|${s.market}`;
      unique.set(key, [...(unique.get(key) ?? []), s]);
    }
  }
  const entries = Array.from(unique.values());
  for (let i = 0; i < entries.length; i += 5) {
    await Promise.all(
      entries.slice(i, i + 5).map(async (group) => {
        const s = group[0];
        const reason = await generateReason({
          homeTeam: s.homeTeam,
          awayTeam: s.awayTeam,
          market: s.market,
          score: s.score,
          homeForm: s.form?.home ?? '',
          awayForm: s.form?.away ?? '',
          homeGoalsAvg: s.form?.homeGoalsAvg ?? 0,
          awayGoalsAvg: s.form?.awayGoalsAvg ?? 0,
          modelProbability: s.probability,
          bookOdds: s.oddsSource === 'bookmaker' ? s.odds : undefined,
          bookName: s.bookName,
        });
        for (const g of group) g.reason = reason;
      }),
    );
  }
}

// If the database migration for the new columns hasn't been applied yet, fall
// back to the original columns instead of losing the whole ticket.
async function insertTolerant(admin: ReturnType<typeof getSupabaseAdmin>, table: string, rows: object | object[], legacy: (r: any) => object) {
  const first = await admin.from(table).insert(rows as never).select('id');
  if (!first.error) return first;
  console.error(`[predictor cron] insert into ${table} failed, retrying without new columns:`, first.error.message);
  const legacyRows = Array.isArray(rows) ? rows.map(legacy) : legacy(rows);
  return admin.from(table).insert(legacyRows as never).select('id');
}

async function runPredictorJob(): Promise<NextResponse> {
  const startedAt = Date.now();
  const ticketDate = new Date().toISOString().slice(0, 10);

  let collected;
  try {
    collected = await collectCandidates();
  } catch (err) {
    console.error('[predictor cron] failed to collect candidates:', err);
    return NextResponse.json({ error: 'Failed to fetch fixtures' }, { status: 502 });
  }
  const { candidates, stats } = collected;
  const scanMs = Date.now() - startedAt;

  const tickets = generateDailyTickets(candidates);

  const analysisStartedAt = Date.now();
  await writeAnalysis(tickets);
  const analysisMs = Date.now() - analysisStartedAt;

  try {
    const admin = getSupabaseAdmin();

    // Replace today's tickets wholesale: this runs once a day.
    await admin.from('predictor_tickets').delete().eq('ticket_date', ticketDate);

    for (const ticket of tickets) {
      const t = await insertTolerant(
        admin,
        'predictor_tickets',
        {
          ticket_date: ticketDate,
          target_band: ticket.targetBand,
          combined_odds: ticket.combinedOdds,
          avg_confidence: ticket.avgConfidence,
          odds_basis: ticket.oddsBasis,
        },
        ({ odds_basis: _o, ...rest }) => rest,
      );
      const ticketId = t.data?.[0]?.id;
      if (t.error || !ticketId) continue;

      await insertTolerant(
        admin,
        'predictor_ticket_selections',
        ticket.selections.map((s) => ({
          ticket_id: ticketId,
          external_event_id: s.externalEventId,
          home_team: s.homeTeam,
          away_team: s.awayTeam,
          competition: s.competition,
          market: s.market,
          score: s.score,
          model_odds: s.modelOdds,
          book_odds: s.oddsSource === 'bookmaker' ? s.odds : null,
          book_name: s.oddsSource === 'bookmaker' ? s.bookName ?? null : null,
          model_probability: s.probability ?? null,
          reason: s.reason,
          kickoff_at: s.kickoffAt,
        })),
        ({ book_odds: _a, book_name: _b, model_probability: _c, ...rest }) => rest,
      );
    }
  } catch (err) {
    console.error('[predictor cron] Supabase persistence failed:', err);
    return NextResponse.json({ error: 'Generated tickets but failed to save them', tickets }, { status: 500 });
  }

  return NextResponse.json({
    ticketDate,
    ...stats,
    ticketsGenerated: tickets.length,
    timingMs: { scan: scanMs, analysis: analysisMs, total: Date.now() - startedAt },
    tickets,
  });
}
