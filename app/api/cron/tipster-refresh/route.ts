import { NextRequest, NextResponse } from 'next/server';
import { fetchStatareaPredictions } from '@/lib/services/statarea';
import { fetchPredictzPredictions } from '@/lib/services/predictz';
import { upsertTipsterPredictions } from '@/lib/services/tipsterCache';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Refreshes the tipster_predictions cache for today + the next 2 days,
// every time it runs. Simple rolling-window strategy: each day's run
// re-fetches all 3 days (today's "tomorrow" becomes today, etc.), so the
// cache always has a 3-day lookahead without needing separate "first
// run vs. subsequent run" logic. This is what /api/decode and the
// Splitter/Predictor should read from (via getCachedTipsterSources) --
// NOT live-fetch per request, which is what was burning ZenRows/Statarea
// calls on every single decode before this existed.

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

function dateDaysFromNow(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    return await runRefresh();
  } catch (err) {
    console.error('[tipster-refresh cron] unhandled error:', err);
    return NextResponse.json(
      { error: 'Unhandled error', message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

async function runRefresh(): Promise<NextResponse> {
  const results: Record<string, { ok: boolean; count: number; error?: string }> = {};

  for (let daysAhead = 0; daysAhead <= 2; daysAhead++) {
    const date = dateDaysFromNow(daysAhead);

    // Statarea: date is a real URL param, fetch directly for this date.
    try {
      const statarea = await fetchStatareaPredictions(date);
      await upsertTipsterPredictions(
        'statarea',
        date,
        statarea.map((p) => ({
          home_team: p.homeTeam,
          away_team: p.awayTeam,
          home_win_pct: p.homeWinPercent,
          draw_pct: p.drawPercent,
          away_win_pct: p.awayWinPercent,
          over_15_pct: p.over15Percent,
          over_25_pct: p.over25Percent,
          over_35_pct: p.over35Percent,
          btts_yes_pct: p.bttsYesPercent,
          btts_no_pct: p.bttsNoPercent,
          predicted_home_score: null,
          predicted_away_score: null,
          odds_home: null,
          odds_draw: null,
          odds_away: null,
        })),
      );
      results[`statarea-${date}`] = { ok: true, count: statarea.length };
    } catch (err) {
      console.error('[tipster-refresh cron] statarea failed for', date, err);
      results[`statarea-${date}`] = { ok: false, count: 0, error: String(err) };
    }

    // Predictz: only has today/tomorrow/one-later-date as fetchable
    // windows, which is exactly what daysAhead (0/1/2) maps to.
    try {
      const predictz = await fetchPredictzPredictions(daysAhead);
      await upsertTipsterPredictions(
        'predictz',
        date,
        predictz.map((p) => ({
          home_team: p.homeTeam,
          away_team: p.awayTeam,
          home_win_pct: null,
          draw_pct: null,
          away_win_pct: null,
          over_15_pct: null,
          over_25_pct: null,
          over_35_pct: null,
          btts_yes_pct: null,
          btts_no_pct: null,
          predicted_home_score: p.predictedScore?.home ?? null,
          predicted_away_score: p.predictedScore?.away ?? null,
          odds_home: p.oddsHome,
          odds_draw: p.oddsDraw,
          odds_away: p.oddsAway,
        })),
      );
      results[`predictz-${date}`] = { ok: true, count: predictz.length };
    } catch (err) {
      console.error('[tipster-refresh cron] predictz failed for', date, err);
      results[`predictz-${date}`] = { ok: false, count: 0, error: String(err) };
    }
  }

  return NextResponse.json({ refreshedAt: new Date().toISOString(), results });
}
