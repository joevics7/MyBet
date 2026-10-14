// Stored Odds Comparison snapshot.
//
//   WRITE (scheduled job only): saveSnapshot() replaces the stored rows with a
//   fresh build. Three cron-job.org jobs call the same URL, so this runs 3x a day.
//   READ (visitors): readWindow() only reads stored rows. Nothing is fetched
//   from any bookmaker or data provider on a visit.
//
// "Cached until the next fetch, then busted": each snapshot carries its build
// time as a VERSION. A visit does one tiny query for the latest version, then
// reads the rows through Next's data cache keyed by that version. When the next
// cron run writes a new snapshot the version changes, so the old cache entry is
// simply never used again and the new data is cached. (Next's data cache skips
// entries over 2MB; then the rows are read from the database each time, which
// is still correct, just slower.)

import { unstable_cache } from 'next/cache';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { DayMatch, DayOdds, SourceStatus } from './types';

export interface SnapshotRow {
  day: string; // YYYY-MM-DD, the UTC date of kickoff
  matches: DayMatch[];
  sources: SourceStatus[];
  generated_at: string;
}

export interface WindowResult {
  matches: DayMatch[];
  sources: SourceStatus[];
  generatedAt: string | null; // null: no snapshot has been stored yet
}

const utcDay = (iso: string) => iso.slice(0, 10);

export function groupByUtcDay(matches: DayMatch[]): Map<string, DayMatch[]> {
  const out = new Map<string, DayMatch[]>();
  for (const m of matches) {
    const d = utcDay(m.kickoff);
    out.set(d, [...(out.get(d) ?? []), m]);
  }
  return out;
}

// UTC dates a [from, to) window touches.
export function datesBetween(fromMs: number, toMs: number): string[] {
  const out: string[] = [];
  for (let t = Date.UTC(new Date(fromMs).getUTCFullYear(), new Date(fromMs).getUTCMonth(), new Date(fromMs).getUTCDate()); t < toMs; t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

// Pure: pick the matches in the visitor's window that haven't kicked off yet.
export function selectWindow(rows: SnapshotRow[], fromMs: number, toMs: number, nowMs: number): WindowResult {
  const start = Math.max(fromMs, nowMs);
  const matches = rows
    .flatMap((r) => r.matches)
    .filter((m) => {
      const t = Date.parse(m.kickoff);
      return t >= start && t < toMs;
    })
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.league.localeCompare(b.league));
  const newest = rows.reduce<SnapshotRow | null>((a, r) => (!a || r.generated_at > a.generated_at ? r : a), null);
  return { matches, sources: newest?.sources ?? [], generatedAt: newest?.generated_at ?? null };
}

// ---- write (cron) ----------------------------------------------------------------

export async function saveSnapshot(built: DayOdds): Promise<{ saved: boolean; days: number; matches: number }> {
  // A build where every source failed must never wipe a good snapshot.
  if (built.matches.length === 0) return { saved: false, days: 0, matches: 0 };

  const admin = getSupabaseAdmin();
  const generatedAt = new Date().toISOString();
  const rows = Array.from(groupByUtcDay(built.matches).entries()).map(([day, matches]) => ({
    day,
    matches,
    match_count: matches.length,
    sources: built.sources,
    generated_at: generatedAt,
  }));

  const { error } = await admin.from('odds_snapshots').upsert(rows, { onConflict: 'day' });
  if (error) throw new Error(`odds_snapshots upsert failed: ${error.message}`);

  // Housekeeping: drop days that are over.
  const cutoff = new Date(Date.now() - 36 * 3600 * 1000).toISOString().slice(0, 10);
  await admin.from('odds_snapshots').delete().lt('day', cutoff);

  return { saved: true, days: rows.length, matches: built.matches.length };
}

// ---- read (visitors) ---------------------------------------------------------------

async function latestVersion(): Promise<string | null> {
  const { data } = await getSupabaseAdmin()
    .from('odds_snapshots')
    .select('generated_at')
    .order('generated_at', { ascending: false })
    .limit(1);
  return data?.[0]?.generated_at ?? null;
}

async function fetchRows(days: string[]): Promise<SnapshotRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('odds_snapshots')
    .select('day, matches, sources, generated_at')
    .in('day', days);
  if (error) throw new Error(`odds_snapshots read failed: ${error.message}`);
  return (data ?? []) as SnapshotRow[];
}

export async function readWindow(fromMs: number, toMs: number): Promise<WindowResult> {
  const version = await latestVersion();
  if (!version) return { matches: [], sources: [], generatedAt: null };

  const days = datesBetween(fromMs, toMs);
  // Keyed by version: a new cron run => new key => fresh data, old entry unused.
  const rows = await unstable_cache(() => fetchRows(days), ['odds-rows', version, ...days], { revalidate: 86400 })();
  return selectWindow(rows, fromMs, toMs, Date.now());
}
