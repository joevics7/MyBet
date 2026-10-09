// Booking Code Converter + Smart Filter.
//
//   decode on the source -> smart filter -> find each pick on the target ->
//   create one new code -> read it back to confirm and get the target's prices.
//
// Smart filter (before converting):
//   - drop games that have already started (on by default)
// Confidence is shown, not filtered on: every pick that can be scored gets its
// BetMeter Score so the user can see which picks are strong and which are risky
// and decide for themselves. Picks we can't score are left unscored, never guessed.
// Anything that can't be converted is listed with a reason; the rest still
// converts, so one unsupported pick never blocks the slip.

import { getPlatform, deepLinkFor, type PlatformAdapter } from '@/lib/services/platforms';
import { parseMarketString } from '@/lib/services/splitter';
import { computeConfidenceScoreFromNames, type MarketSelector } from '@/lib/services/confidenceEngine';
import type { EncodeSelectionInput } from '@/lib/services/sportybet';
import type { NormalizedSelection } from '@/lib/services/types';
import { resolveForBetway, resolveForSportyFamily, type Resolution } from './resolve';

export const MAX_LEGS = 20;
const FAMILY = new Set(['sportybet', 'footballcom', 'msport']); // shared Sportradar ids

export interface ConvertOptions {
  sourceSlug: string;
  targetSlug: string;
  code: string;
  dropStarted: boolean;
}

export type LegStatus = 'converted' | 'dropped' | 'failed';

export interface LegReport {
  homeTeam: string;
  awayTeam: string;
  market: string;
  kickoffAt: string | null;
  sourceOdds: number;
  targetOdds: number | null;
  score: number | null;
  status: LegStatus;
  reason?: string;
}

export interface ConvertResult {
  status: 'ok';
  source: { slug: string; label: string };
  target: { slug: string; label: string };
  legs: LegReport[];
  newCode: string | null;
  deepLink: string | null;
  convertedCount: number;
  totalLegs: number;
  sourceTotal: number | null; // converted picks only, at the source's prices
  targetTotal: number | null; // the new code at the target's prices
  truncated: boolean;
}

export type ConvertError = { status: 'error'; message: string };
export type Scorer = (sel: NormalizedSelection, selector: MarketSelector) => Promise<number | null>;

const defaultScorer: Scorer = async (sel, selector) => {
  try {
    const out = await computeConfidenceScoreFromNames({
      homeTeamName: sel.homeTeam,
      awayTeamName: sel.awayTeam,
      kickoffAt: sel.kickoffAt,
      market: selector,
    });
    return out.status === 'ok' ? out.result.score : null;
  } catch (err) {
    console.error('[converter] scoring failed, leaving unscored:', sel.homeTeam, err);
    return null;
  }
};

const product = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a * b, 1) * 100) / 100 : null);

// Encode everything; if the target rejects the slip, find which picks it
// rejects (one at a time) and re-encode the rest.
async function encodeIsolating(
  target: PlatformAdapter,
  inputs: { idx: number; input: EncodeSelectionInput }[],
): Promise<{ code: string | null; rejected: number[] }> {
  if (inputs.length === 0) return { code: null, rejected: [] };
  const all = await target.encode!(inputs.map((i) => i.input));
  if (all.status === 'ok' && all.shareCode) return { code: all.shareCode, rejected: [] };
  if (inputs.length === 1) return { code: null, rejected: [inputs[0].idx] };

  const rejected: number[] = [];
  const ok: typeof inputs = [];
  for (let i = 0; i < inputs.length; i += 4) {
    const batch = inputs.slice(i, i + 4);
    const res = await Promise.all(batch.map((b) => target.encode!([b.input]).catch(() => ({ status: 'failed' as const, shareCode: null }))));
    res.forEach((r, k) => (r.status === 'ok' && r.shareCode ? ok.push(batch[k]) : rejected.push(batch[k].idx)));
  }
  if (ok.length === 0) return { code: null, rejected };
  const retry = await target.encode!(ok.map((i) => i.input));
  if (retry.status === 'ok' && retry.shareCode) return { code: retry.shareCode, rejected };
  return { code: null, rejected: [...rejected, ...ok.map((o) => o.idx)] };
}

export async function convertSlip(opts: ConvertOptions, scorer: Scorer = defaultScorer): Promise<ConvertResult | ConvertError> {
  const source = getPlatform(opts.sourceSlug);
  const target = getPlatform(opts.targetSlug);
  if (!source || !target) return { status: 'error', message: 'Unknown platform.' };
  if (source.slug === target.slug) return { status: 'error', message: 'Pick a different platform to convert to.' };
  if (!target.encode) return { status: 'error', message: `We can't create ${target.label} codes yet.` };

  const decoded = await source.decode(opts.code.trim());
  if (decoded.status !== 'ok' || decoded.selections.length === 0) {
    return { status: 'error', message: "Couldn't read that code. Check the platform and the code, then try again." };
  }

  const sels = decoded.selections.slice(0, MAX_LEGS);
  const now = Date.now();
  const reports: LegReport[] = sels.map((s) => ({
    homeTeam: s.homeTeam,
    awayTeam: s.awayTeam,
    market: s.market,
    kickoffAt: s.kickoffAt,
    sourceOdds: s.odds,
    targetOdds: null,
    score: null,
    status: 'failed',
  }));
  const selectors = sels.map((s) => parseMarketString(s.market, s.homeTeam, s.awayTeam));

  // ---- 1. smart filter ---------------------------------------------------------
  const live: number[] = [];
  for (let i = 0; i < sels.length; i++) {
    const started = sels[i].isLocked || (sels[i].kickoffAt !== null && Date.parse(sels[i].kickoffAt!) <= now);
    if (opts.dropStarted && started) {
      reports[i].status = 'dropped';
      reports[i].reason = 'Already started';
      continue;
    }
    live.push(i);
  }

  // ---- 1b. confidence (shown on every scoreable pick) ----------------------------
  const scoreable = live.filter((i) => selectors[i]);
  for (let k = 0; k < scoreable.length; k += 3) {
    const batch = scoreable.slice(k, k + 3);
    const scores = await Promise.all(batch.map((i) => scorer(sels[i], selectors[i]!)));
    batch.forEach((i, n) => (reports[i].score = scores[n]));
  }

  // ---- 2. find each pick on the target -------------------------------------------
  const inputs = new Map<number, { input: EncodeSelectionInput; targetOdds: number | null }>();
  const toResolve: number[] = [];
  for (const i of live) {
    const s = sels[i];
    const sameFamily = FAMILY.has(source.slug) && FAMILY.has(target.slug);
    if (sameFamily && s.rawMarketId && s.rawOutcomeId && s.externalEventId.startsWith('sr:match:')) {
      inputs.set(i, {
        input: { externalEventId: s.externalEventId, marketId: s.rawMarketId, outcomeId: s.rawOutcomeId, specifier: s.rawSpecifier },
        targetOdds: null,
      });
    } else {
      toResolve.push(i);
    }
  }

  if (toResolve.length > 0) {
    const legs = toResolve.map((i) => ({ leg: sels[i], selector: selectors[i] }));
    let resolved: Resolution[];
    try {
      resolved = FAMILY.has(target.slug) ? await resolveForSportyFamily(legs) : await resolveForBetway(legs);
    } catch (err) {
      console.error('[converter] resolve failed:', err);
      resolved = legs.map(() => ({ ok: false as const, reason: `Couldn't reach ${target.label} to match this game` }));
    }
    toResolve.forEach((i, k) => {
      const r = resolved[k];
      if (r.ok) inputs.set(i, { input: r.input, targetOdds: r.targetOdds });
      else reports[i].reason = r.reason;
    });
  }

  // Two picks from one game can't share a Betway slip.
  if (target.slug === 'betway') {
    const seen = new Set<string>();
    for (const [i, v] of Array.from(inputs.entries())) {
      if (seen.has(v.input.externalEventId)) {
        inputs.delete(i);
        reports[i].reason = 'Conflicts with another pick from the same game';
      }
      seen.add(v.input.externalEventId);
    }
  }

  // ---- 3. create the new code ----------------------------------------------------
  const list = Array.from(inputs.entries()).map(([idx, v]) => ({ idx, input: v.input }));
  const { code, rejected } = await encodeIsolating(target, list);
  for (const idx of rejected) {
    inputs.delete(idx);
    reports[idx].reason = `${target.label} rejected this pick`;
  }

  // ---- 4. read it back: confirms the code works and gives the target's prices ----
  let targetTotal: number | null = null;
  if (code) {
    for (const [idx, v] of Array.from(inputs.entries())) {
      reports[idx].status = 'converted';
      reports[idx].targetOdds = v.targetOdds;
      reports[idx].reason = undefined;
    }
    try {
      const back = await target.decode(code);
      if (back.status === 'ok') {
        targetTotal = back.totalOdds;
        for (const [idx, v] of Array.from(inputs.entries())) {
          const hit = back.selections.find((b) => b.externalEventId === v.input.externalEventId && b.rawOutcomeId === v.input.outcomeId);
          if (hit) reports[idx].targetOdds = hit.odds;
        }
      }
    } catch (err) {
      console.error('[converter] read-back failed (code was still created):', err);
    }
    if (targetTotal === null) {
      const prices = reports.filter((r) => r.status === 'converted' && r.targetOdds !== null).map((r) => r.targetOdds!);
      if (prices.length === inputs.size) targetTotal = product(prices);
    }
  }

  const converted = reports.filter((r) => r.status === 'converted');
  return {
    status: 'ok',
    source: { slug: source.slug, label: source.label },
    target: { slug: target.slug, label: target.label },
    legs: reports,
    newCode: code,
    deepLink: code ? deepLinkFor(target.slug, code) : null,
    convertedCount: converted.length,
    totalLegs: reports.length,
    sourceTotal: product(converted.map((r) => r.sourceOdds)),
    targetTotal,
    truncated: decoded.selections.length > MAX_LEGS,
  };
}
