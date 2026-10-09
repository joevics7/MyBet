import { NextResponse } from 'next/server';
import { buildDay } from '@/lib/odds/day';
import type { DayOdds } from '@/lib/odds/types';

// Building a day calls several upstream feeds; the result is cached so
// visitors share it.
export const maxDuration = 60;

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; data: DayOdds }>();
const inflight = new Map<string, Promise<DayOdds>>();

// GET /api/odds/day?from=ISO&to=ISO  (the visitor's local day, as UTC instants)
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const from = Date.parse(sp.get('from') ?? '');
  const to = Date.parse(sp.get('to') ?? '');
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 36 * 3600 * 1000) {
    return NextResponse.json({ error: 'from/to must be ISO times at most 36h apart' }, { status: 400 });
  }
  // Align to the minute so near-identical requests share a cache entry.
  const f = Math.floor(from / 60000) * 60000;
  const t = Math.floor(to / 60000) * 60000;
  const key = `${f}-${t}`;

  const hit = cache.get(key);
  let data = hit && Date.now() - hit.at < TTL_MS ? hit.data : null;
  if (!data) {
    let p = inflight.get(key);
    if (!p) {
      p = buildDay(f, t).finally(() => inflight.delete(key));
      inflight.set(key, p);
    }
    try {
      data = await p;
      if (data.matches.length > 0) cache.set(key, { at: Date.now(), data });
    } catch (err) {
      console.error('[odds/day]', err);
      return NextResponse.json({ status: 'error', message: "Couldn't load odds. Try again shortly." });
    }
  }
  return NextResponse.json(
    { status: 'ok', ...data },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900' } },
  );
}
