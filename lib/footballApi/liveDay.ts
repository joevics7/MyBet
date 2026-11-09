// One predictor run's API-Football data, kept IN MEMORY only (nothing is saved):
//   1 request  -> the day's whole fixture list
//   up to 40   -> API-Football's prediction for the 40 chosen games (paced to the plan's per-minute limit)
// The matcher and the probability model read this while the run is going; the next run starts fresh.

import { fetchFixturesForDate, fetchPrediction, isApiFootballConfigured, requestGapMs } from '@/lib/services/apiFootball';
import type { FdMatch } from '@/lib/services/footballData';

type Json = Record<string, any>;

interface Live { date: string; fixtures: FdMatch[]; predictions: Map<number, Json> }
let live: Live | null = null;

export const GAMES_TO_PREDICT = 40;

export async function getLiveFixtures(dateFrom: string, dateTo: string): Promise<FdMatch[]> {
  if (!live) return [];
  return live.fixtures.filter((f) => f.utcDate.slice(0, 10) >= dateFrom && f.utcDate.slice(0, 10) <= dateTo);
}
export async function getLivePrediction(fixtureId: number): Promise<Json | null> {
  return live?.predictions.get(fixtureId) ?? null;
}
export function livePredictedIds(): Set<number> {
  return new Set(live ? Array.from(live.predictions.keys()) : []);
}

export interface LiveDayReport {
  configured: boolean;
  listGames: number;
  chosen: number;
  predicted: number;
  requests: number;
  gapMs?: number;
  stopped?: string;
}

// pick(): returns the API-Football fixture ids to fetch predictions for (it can use getLiveFixtures, already loaded).
// deadlineAt: stop starting new requests after this time (epoch ms), so the run still finishes and saves its tickets.
export async function loadApiFootballDay(date: string, pick: () => Promise<number[]>, deadlineAt: number): Promise<LiveDayReport> {
  live = { date, fixtures: [], predictions: new Map() };
  if (!isApiFootballConfigured()) return { configured: false, listGames: 0, chosen: 0, predicted: 0, requests: 0, stopped: 'API_FOOTBALL_KEY missing, or the account is suspended / out of quota' };

  const report: LiveDayReport = { configured: true, listGames: 0, chosen: 0, predicted: 0, requests: 0 };
  try {
    live.fixtures = await fetchFixturesForDate(date);
    report.requests++;
    report.listGames = live.fixtures.length;
  } catch (err) {
    report.stopped = `fixture list failed: ${err instanceof Error ? err.message : String(err)}`;
    return report;
  }

  let ids: number[] = [];
  try { ids = (await pick()).slice(0, GAMES_TO_PREDICT); } catch (err) { report.stopped = `choosing games failed: ${err instanceof Error ? err.message : String(err)}`; return report; }
  report.chosen = ids.length;

  for (let i = 0; i < ids.length; i++) {
    if (Date.now() >= deadlineAt) { report.stopped = `time limit reached after ${report.predicted} predictions`; break; }
    try {
      const p = await fetchPrediction(ids[i]);
      report.requests++;
      if (p) { live.predictions.set(ids[i], p); report.predicted++; }
    } catch (err) {
      report.stopped = err instanceof Error ? err.message : String(err);
      break;
    }
    report.gapMs = requestGapMs();
    if (i < ids.length - 1) await new Promise((r) => setTimeout(r, report.gapMs));
  }
  return report;
}
