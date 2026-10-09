// Builds the whole day: every match from every source, with each bookmaker's
// odds taken from the best available source.
//
// Priority, per bookmaker AND per market:
//   1. its own direct feed (SportyBet, Football.com, Betway NG)   <- main
//   2. the OddsPapi aggregator                                      <- fallback
// A direct price always wins; the aggregator only fills what's missing
// (a market the direct feed lacks, or the whole bookmaker if its feed failed).
// Bookmakers with no direct feed (Bet9ja, 1xBet, ...) come from the aggregator.
//
// Matches are joined by Sportradar id when both sides have one, otherwise by
// normalised team names + kickoff within 2 hours. Matches that only some
// sources know about still appear.

import { normalizeTeamName, similarity } from '@/lib/services/teamMatcher';
import { fetchFamilyFeed, SPORTYBET, FOOTBALLCOM } from './sportybetFeed';
import { fetchBetwayFeed } from './betwayFeed';
import { fetchAggregatorDay, isAggregatorConfigured } from './aggregatorFeed';
import type { DayMatch, DayOdds, FeedMatch, OddsByMarket, PlatformOdds, SourceStatus } from './types';

const BETWAY_SLUG = 'betway-ng';
const FUZZY_WINDOW_MS = 2 * 3600 * 1000;
const MAX_PLATFORMS_PER_MATCH = 40;

// Display order for the bookmakers people use most; the rest sort by name.
const ORDER = ['sportybet', 'footballcom', 'msport', BETWAY_SLUG, 'bet9ja', 'bangbet', 'betking', '1xbet', 'stake', 'bet365', 'pinnacle'];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
// Aggregator slugs that mean one of OUR direct bookmakers.
const KNOWN: Record<string, string> = { sportybet: 'sportybet', footballcom: 'footballcom' };
const canonical = (slug: string) => KNOWN[norm(slug)] ?? norm(slug);

interface Working {
  id: string;
  srId: string | null;
  home: string;
  away: string;
  nh: string;
  na: string;
  kickoffMs: number;
  kickoff: string;
  league: string;
  country: string;
  plat: Map<string, PlatformOdds>;
}

function mergeOdds(into: OddsByMarket, from: OddsByMarket) {
  for (const [k, v] of Object.entries(from)) if (!(k in into)) (into as Record<string, unknown>)[k] = v; // fill gaps only
}

function setPlatform(m: Working, slug: string, label: string, via: PlatformOdds['via'], odds: OddsByMarket) {
  const cur = m.plat.get(slug);
  if (!cur) return void m.plat.set(slug, { slug, label, via, odds: { ...odds } });
  if (via === 'direct' && cur.via === 'aggregator') {
    const merged: OddsByMarket = { ...odds };
    mergeOdds(merged, cur.odds); // aggregator keeps only markets direct lacks
    m.plat.set(slug, { slug, label, via: 'direct', odds: merged });
  } else {
    mergeOdds(cur.odds, odds);
  }
}

function newWorking(f: Pick<FeedMatch, 'srId' | 'home' | 'away' | 'kickoff' | 'league' | 'country'>): Working {
  return {
    id: f.srId ?? `${norm(f.home)}-${norm(f.away)}-${Date.parse(f.kickoff)}`,
    srId: f.srId,
    home: f.home,
    away: f.away,
    nh: normalizeTeamName(f.home),
    na: normalizeTeamName(f.away),
    kickoffMs: Date.parse(f.kickoff),
    kickoff: f.kickoff,
    league: f.league,
    country: f.country,
    plat: new Map(),
  };
}

class MatchIndex {
  list: Working[] = [];
  bySr = new Map<string, Working>();

  find(f: { srId: string | null; home: string; away: string; kickoff: string }): Working | null {
    if (f.srId && this.bySr.has(f.srId)) return this.bySr.get(f.srId)!;
    const nh = normalizeTeamName(f.home);
    const na = normalizeTeamName(f.away);
    const t = Date.parse(f.kickoff);
    let best: { m: Working; s: number } | null = null;
    for (const m of this.list) {
      if (Math.abs(m.kickoffMs - t) > FUZZY_WINDOW_MS) continue;
      if (f.srId && m.srId && f.srId !== m.srId) continue; // different Sportradar matches never merge
      const hs = similarity(nh, m.nh);
      const as = similarity(na, m.na);
      if (hs < 0.7 || as < 0.7) continue;
      if (!best || hs + as > best.s) best = { m, s: hs + as };
    }
    return best?.m ?? null;
  }

  upsert(f: Pick<FeedMatch, 'srId' | 'home' | 'away' | 'kickoff' | 'league' | 'country'>): Working {
    const hit = this.find(f);
    if (hit) {
      if (!hit.srId && f.srId) {
        hit.srId = f.srId;
        this.bySr.set(f.srId, hit);
      }
      if (!hit.league && f.league) hit.league = f.league;
      if (!hit.country && f.country) hit.country = f.country;
      return hit;
    }
    const w = newWorking(f);
    this.list.push(w);
    if (w.srId) this.bySr.set(w.srId, w);
    return w;
  }
}

function sortPlatforms(p: PlatformOdds[]): PlatformOdds[] {
  const rank = (s: string) => {
    const i = ORDER.indexOf(s);
    return i === -1 ? ORDER.length : i;
  };
  return p.sort((a, b) => rank(a.slug) - rank(b.slug) || a.label.localeCompare(b.label));
}

export async function buildDay(fromMs: number, toMs: number): Promise<DayOdds> {
  const sources: SourceStatus[] = [];
  const index = new MatchIndex();

  // 1) direct feeds, in parallel. SportyBet is the main match list.
  const direct = [
    { cfg: { slug: SPORTYBET.slug, label: SPORTYBET.label, role: 'main' as const }, run: () => fetchFamilyFeed(SPORTYBET, fromMs, toMs) },
    { cfg: { slug: FOOTBALLCOM.slug, label: FOOTBALLCOM.label, role: 'direct' as const }, run: () => fetchFamilyFeed(FOOTBALLCOM, fromMs, toMs) },
    { cfg: { slug: BETWAY_SLUG, label: 'Betway NG', role: 'direct' as const }, run: () => fetchBetwayFeed(fromMs, toMs) },
  ];
  const results = await Promise.allSettled(direct.map((d) => d.run()));

  results.forEach((r, i) => {
    const { slug, label, role } = direct[i].cfg;
    if (r.status === 'rejected') {
      console.error(`[odds/day] ${label} feed failed:`, r.reason);
      sources.push({ slug, label, role, ok: false, matches: 0, note: String(r.reason?.message ?? r.reason).slice(0, 120) });
      return;
    }
    sources.push({ slug, label, role, ok: true, matches: r.value.length });
    for (const f of r.value) setPlatform(index.upsert(f), slug, label, 'direct', f.odds);
  });

  // 2) aggregator: fallback for the same bookmakers + everything else.
  if (isAggregatorConfigured()) {
    try {
      const known = new Set(index.list.map((m) => m.srId).filter((x): x is string => !!x));
      const agg = await fetchAggregatorDay(fromMs, toMs, known);
      for (const a of agg) {
        const m = index.upsert(a);
        for (const [slug, b] of Object.entries(a.books)) setPlatform(m, canonical(slug), b.label, 'aggregator', b.odds);
      }
      sources.push({ slug: 'oddspapi', label: 'OddsPapi', role: 'fallback', ok: true, matches: agg.length });
    } catch (err) {
      console.error('[odds/day] aggregator failed:', err);
      sources.push({ slug: 'oddspapi', label: 'OddsPapi', role: 'fallback', ok: false, matches: 0, note: String((err as Error).message).slice(0, 120) });
    }
  } else {
    sources.push({ slug: 'oddspapi', label: 'OddsPapi', role: 'fallback', ok: false, matches: 0, note: 'Not configured' });
  }

  const matches: DayMatch[] = index.list
    .filter((m) => m.plat.size > 0)
    .sort((a, b) => a.kickoffMs - b.kickoffMs || a.league.localeCompare(b.league))
    .map((m) => ({
      id: m.id,
      home: m.home,
      away: m.away,
      kickoff: m.kickoff,
      league: m.league,
      country: m.country,
      platforms: sortPlatforms(Array.from(m.plat.values())).slice(0, MAX_PLATFORMS_PER_MATCH),
    }));

  return { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString(), generatedAt: new Date().toISOString(), matches, sources };
}
