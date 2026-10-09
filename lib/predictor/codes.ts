// Creates a booking code for each ticket on every platform we can create codes
// on, so the page can show a ready-made code under each ticket.
//
// Each pick is found on the platform (SportyBet's live feed for the SportyBet
// family; Betway's feed for Betway) using the same resolvers as the Converter,
// then ONE code is created and read back to get the platform's own total odds.
// All-or-nothing per platform: a code is only offered when every pick of the
// ticket exists there, so the code is always exactly the ticket shown.
// Best-effort and time-boxed: running out of time or a failing platform just
// means fewer codes, never a lost ticket (tickets are saved before this runs).

import { getPlatform, deepLinkFor } from '@/lib/services/platforms';
import type { EncodeSelectionInput } from '@/lib/services/sportybet';
import type { NormalizedSelection } from '@/lib/services/types';
import type { MarketSelector } from '@/lib/services/confidenceEngine';
import type { CandidateSelection, GeneratedTicket, TicketCode } from '@/lib/services/predictorSelection';
import { resolveForBetway, resolveForSportyFamily, type Resolution } from '@/lib/converter/resolve';

const SPORTY_FAMILY = ['sportybet', 'footballcom', 'msport'];
const ALL_PLATFORMS = [...SPORTY_FAMILY, 'betway'];
const CONCURRENCY = 4;

const legKey = (s: CandidateSelection) => `${s.externalEventId}|${s.market}`;

function toLeg(s: CandidateSelection): { leg: NormalizedSelection; selector: MarketSelector | null } {
  return {
    leg: {
      externalEventId: s.externalEventId,
      homeTeam: s.homeTeam,
      awayTeam: s.awayTeam,
      market: s.market,
      odds: s.odds,
      kickoffAt: s.kickoffAt,
      isLocked: false,
      matchStatus: null,
      isWinning: null,
    },
    selector: s.selector ?? null,
  };
}

async function resolveAll(
  fn: typeof resolveForSportyFamily,
  uniques: CandidateSelection[],
): Promise<Map<string, Resolution>> {
  const out = new Map<string, Resolution>();
  try {
    const res = await fn(uniques.map(toLeg));
    uniques.forEach((s, i) => out.set(legKey(s), res[i]));
  } catch (err) {
    console.error('[predictor codes] resolve failed:', err);
  }
  return out;
}

export async function attachBookingCodes(tickets: GeneratedTicket[], deadlineMs: number): Promise<number> {
  if (tickets.length === 0) return 0;

  const seen = new Map<string, CandidateSelection>();
  for (const t of tickets) for (const s of t.selections) seen.set(legKey(s), s);
  const uniques = Array.from(seen.values());

  // One feed fetch per platform family covers every pick of every ticket.
  const [sporty, betway] = await Promise.all([
    resolveAll(resolveForSportyFamily, uniques),
    resolveAll(resolveForBetway, uniques),
  ]);

  const jobs: { ticket: GeneratedTicket; slug: string; inputs: EncodeSelectionInput[] }[] = [];
  for (const ticket of tickets) {
    for (const slug of ALL_PLATFORMS) {
      const map = SPORTY_FAMILY.includes(slug) ? sporty : betway;
      const inputs: EncodeSelectionInput[] = [];
      let complete = true;
      for (const s of ticket.selections) {
        const r = map.get(legKey(s));
        if (r && r.ok) inputs.push(r.input);
        else complete = false;
      }
      if (complete && inputs.length > 0) jobs.push({ ticket, slug, inputs });
    }
  }

  let created = 0;
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, async () => {
      while (next < jobs.length) {
        if (Date.now() > deadlineMs) return;
        const { ticket, slug, inputs } = jobs[next++];
        const adapter = getPlatform(slug);
        if (!adapter?.encode) continue;
        try {
          const enc = await adapter.encode(inputs);
          if (enc.status !== 'ok' || !enc.shareCode) continue;
          let totalOdds: number | null = null;
          try {
            const back = await adapter.decode(enc.shareCode);
            if (back.status === 'ok') totalOdds = back.totalOdds;
          } catch {
            /* the code was created; the read-back is only for the total */
          }
          const code: TicketCode = {
            slug,
            label: adapter.label,
            code: enc.shareCode,
            deepLink: deepLinkFor(slug, enc.shareCode),
            totalOdds,
          };
          ticket.bookingCodes.push(code);
          created++;
        } catch (err) {
          console.error(`[predictor codes] ${slug} failed for band ${ticket.targetBand}:`, err);
        }
      }
    }),
  );

  // Stable display order: SportyBet first.
  const order = (s: string) => ALL_PLATFORMS.indexOf(s);
  for (const t of tickets) t.bookingCodes.sort((a, b) => order(a.slug) - order(b.slug));
  return created;
}
