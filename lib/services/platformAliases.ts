// Learns the spellings betting platforms use ("Spurs", "FC Internazionale Milano") from the slips people decode,
// and attaches them to the same team ids as the tipster sites. Reuses the exact tipster learning pipeline
// (teamRegistry.ts), so the same safeguards apply: Vitibet is the base, Gemini only picks among candidate
// fixtures and must be "high" confidence, and ambiguous one-word names are never saved globally.
//
// Runs in the background after a decode (waitUntil) so it never slows the response. It only has something to
// learn from when the match is in the cached Vitibet list for that date (today, as refreshed by the cron).

import { planAliasLearning, resolveWithAi, saveLearnedVariants, dedupeLearned, type LearnedVariant, type SourceRow } from './teamRegistry';
import type { TeamRegistry } from './teamNameMatch';
import type { CachedTipsterSources } from './tipsterCache';

export interface SlipLeg {
  homeTeam: string;
  awayTeam: string;
  kickoffAt?: string | null;
}

export async function learnPlatformNames(platformSlug: string, legs: SlipLeg[], sources: CachedTipsterSources, registry: TeamRegistry) {
  const report = { legs: legs.length, withSpine: 0, alreadyKnown: 0, learnedWithoutAi: 0, askedGemini: 0, geminiAccepted: 0, saved: 0, error: null as string | null };
  const byDate = new Map<string, SlipLeg[]>();
  for (const leg of legs) {
    const date = leg.kickoffAt?.slice(0, 10);
    if (!date || !leg.homeTeam || !leg.awayTeam) continue;
    byDate.set(date, [...(byDate.get(date) ?? []), leg]);
  }

  const all: LearnedVariant[] = [];
  for (const [date, dayLegs] of Array.from(byDate.entries())) {
    const spine = sources.vitibet
      .filter((v) => v.matchDate === date)
      .map((v) => ({ id: v.fixtureId ?? `${v.homeTeam}|${v.awayTeam}`, home: v.homeTeam, away: v.awayTeam }));
    if (spine.length === 0) continue;
    report.withSpine += dayLegs.length;

    const rows: SourceRow[] = dayLegs.map((l, i) => ({ rowId: `${date}#${i}`, source: platformSlug, home: l.homeTeam, away: l.awayTeam }));
    const plan = planAliasLearning(spine, rows, registry);
    const ai = plan.needAi.length ? await resolveWithAi(plan.needAi, registry, 1) : null;
    report.alreadyKnown += plan.alreadyKnown;
    report.learnedWithoutAi += plan.learned.length;
    report.askedGemini += ai?.asked ?? 0;
    report.geminiAccepted += ai?.accepted ?? 0;
    if (ai?.error) report.error = ai.error;
    all.push(...plan.learned, ...(ai?.learned ?? []));
  }

  // the platform's own spellings are tagged 'platform'; the spine's base spelling stays 'spine'
  const tagged = dedupeLearned(all.map((l) => (l.via === 'spine' ? l : { ...l, via: 'platform' as const })));
  if (tagged.length) {
    const saved = await saveLearnedVariants(tagged);
    report.saved = saved.variants;
    if (saved.error) report.error = saved.error;
  }
  return report;
}
