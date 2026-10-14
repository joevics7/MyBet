// OPERATING NOTES -- Odds Comparison (read side)
// - Read-only. Returns the STORED snapshot for the visitor's day; it never
//   calls a bookmaker or data provider. Fresh data arrives only when the
//   scheduled job (/api/cron/odds, 3x a day via cron-job.org) stores a new
//   snapshot; until then everyone sees the same stored data.
import { NextResponse } from 'next/server';
import { readWindow } from '@/lib/odds/snapshot';

export const maxDuration = 30;

// GET /api/odds/day?from=ISO&to=ISO  (the visitor's local day, as UTC instants)
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const from = Date.parse(sp.get('from') ?? '');
  const to = Date.parse(sp.get('to') ?? '');
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 36 * 3600 * 1000) {
    return NextResponse.json({ error: 'from/to must be ISO times at most 36h apart' }, { status: 400 });
  }
  try {
    const result = await readWindow(from, to);
    return NextResponse.json({ status: 'ok', from: new Date(from).toISOString(), to: new Date(to).toISOString(), ...result });
  } catch (err) {
    console.error('[odds/day]', err);
    return NextResponse.json({ status: 'error', message: "Couldn't load odds. Try again shortly." });
  }
}
