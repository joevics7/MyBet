import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { getCachedTipsterSources } from '@/lib/services/tipsterCache';
import { loadTeamRegistry, planAliasLearning, resolveWithAi, saveLearnedVariants, dedupeLearned, type SourceRow } from '@/lib/services/teamRegistry';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Learns team-name spellings from today's cached tipster data (run it AFTER /api/cron/tipster-refresh, e.g. 10
// minutes later). Reads the cache only -- no scraping, no ZenRows. Vitibet's names are the base; the other
// sources' spellings are attached to them (see teamRegistry.ts). Safe to run repeatedly: spellings already
// stored are skipped, and anything Gemini cannot place this time is retried on the next run.

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (req.nextUrl.searchParams.get('wait') === '1') {
    try {
      return NextResponse.json(await run());
    } catch (err) {
      console.error('[team-aliases cron] unhandled error:', err);
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  waitUntil(
    run()
      .then((report) => console.log('[team-aliases cron] finished:', JSON.stringify(report)))
      .catch((err) => console.error('[team-aliases cron] unhandled error:', err)),
  );
  return NextResponse.json({ status: 'started', note: 'Running in the background. Add ?wait=1 to run in the foreground and see the report.' }, { status: 202 });
}

async function run() {
  const today = new Date().toISOString().slice(0, 10);
  const [sources, registry] = await Promise.all([getCachedTipsterSources([today]), loadTeamRegistry()]);

  const spine = sources.vitibet
    .filter((v) => v.matchDate === today)
    .map((v) => ({ id: v.fixtureId ?? `${v.homeTeam}|${v.awayTeam}`, home: v.homeTeam, away: v.awayTeam }));

  const rows: SourceRow[] = [
    ...sources.statarea.filter((s) => s.date === today).map((s, i) => ({ rowId: `a${i}`, source: 'statarea', home: s.homeTeam, away: s.awayTeam })),
    ...sources.predictz.map((p, i) => ({ rowId: `p${i}`, source: 'predictz', home: p.homeTeam, away: p.awayTeam })),
    ...sources.soccertips.filter((s) => s.matchDate === today).map((s, i) => ({ rowId: `s${i}`, source: 'soccertips', home: s.homeTeam, away: s.awayTeam })),
  ];

  if (spine.length === 0) return { date: today, note: 'No Vitibet rows cached for today -- run /api/cron/tipster-refresh first.', spine: 0, rows: rows.length };

  const plan = planAliasLearning(spine, rows, registry);
  const ai = await resolveWithAi(plan.needAi, registry);
  const saved = await saveLearnedVariants(dedupeLearned([...plan.learned, ...ai.learned]));

  return {
    date: today,
    spineFixtures: spine.length,
    sourceRows: rows.length,
    alreadyKnown: plan.alreadyKnown,
    learnedWithoutAi: plan.learned.length,
    noLookAlikeCandidate: plan.noCandidates,
    askedGemini: ai.asked,
    geminiAccepted: ai.accepted,
    geminiRejected: ai.rejected,
    geminiNone: ai.none,
    geminiError: ai.error,
    saved,
  };
}
