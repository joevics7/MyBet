import type { ReactNode } from 'react';
import { fetchStatareaPredictions } from '@/lib/services/statarea';
import { fetchPredictzWithRaw } from '@/lib/services/predictz';
import { fetchVitibetPredictions } from '@/lib/services/vitibet';
import { fetchSoccerTipsPredictions } from '@/lib/services/soccertips';

// Diagnostic page, not a product feature -- not linked from nav.
// Shows the four tipster sources side by side so each can be confirmed by eye:
//   Statarea   plain HTML   percentages (not a score)
//   PredictZ   ZenRows      score, parsed by Gemini (regex kept as fallback/cross-check)
//   Vitibet    plain HTML   score + fixture id, names cleaned by Gemini, score exact via regex
//   SoccerTips plain HTML   score, names cleaned by Gemini, score exact via regex
// Always fetches fresh (no caching). Every visit costs real ZenRows credits and Gemini tokens, so when
// CRON_SECRET is set the page needs ?key=<CRON_SECRET>. (Forebet's raw fetch was removed from this page:
// it is not one of the four sources and burned ZenRows credits on every visit.)
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T | null; error: string | null; ms: number }> {
  const t0 = Date.now();
  try {
    return { value: await fn(), error: null, ms: Date.now() - t0 };
  } catch (err) {
    return { value: null, error: err instanceof Error ? err.message : String(err), ms: Date.now() - t0 };
  }
}

function Section({ title, summary, error, children }: { title: string; summary: string; error?: string | null; children: ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="font-bold mb-2">
        {title} &mdash; {summary}
        {error && <span className="text-[hsl(var(--rust))]"> (ERROR: {error})</span>}
      </h2>
      {children}
    </section>
  );
}

function Box({ children }: { children: ReactNode }) {
  return <div className="space-y-1.5 max-h-[600px] overflow-auto border border-border rounded-sm p-3 bg-card">{children}</div>;
}

function Facts({ items }: { items: [string, string | number | null][] }) {
  return (
    <div className="mb-2 text-muted-foreground">
      {items.map(([k, v]) => (
        <span key={k} className="mr-4 inline-block">
          {k}: <span className="text-foreground">{v ?? '—'}</span>
        </span>
      ))}
    </div>
  );
}

function Raw({ title, text }: { title: string; text: string | null }) {
  return (
    <details className="mb-4">
      <summary className="cursor-pointer font-bold">
        {title} &mdash; {text ? `${text.length} chars` : 'nothing fetched'}
      </summary>
      <div className="mt-2 max-h-[600px] overflow-auto border border-border rounded-sm p-3 bg-card whitespace-pre-wrap break-words">
        {text ? text.slice(0, 15000) : <span className="text-muted-foreground">No content.</span>}
        {text && text.length > 15000 && <p className="text-muted-foreground mt-2">... truncated, {text.length - 15000} more chars</p>}
      </div>
    </details>
  );
}

export default async function ScrapeStatusPage({ searchParams }: { searchParams: { key?: string } }) {
  const secret = process.env.CRON_SECRET;
  if (secret && searchParams.key !== secret) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10 font-mono text-xs">
        <h1 className="text-lg font-bold mb-1">Scrape Status</h1>
        <p className="text-muted-foreground">Locked: every visit costs ZenRows credits and Gemini tokens. Open this page with ?key=&lt;CRON_SECRET&gt;.</p>
      </div>
    );
  }

  const [statarea, predictz, vitibet, soccertips] = await Promise.all([
    timed(() => fetchStatareaPredictions()),
    timed(() => fetchPredictzWithRaw()),
    timed(() => fetchVitibetPredictions()),
    timed(() => fetchSoccerTipsPredictions()),
  ]);

  const pz = predictz.value;
  const pzd = pz?.diagnostics ?? null;
  const vt = vitibet.value;
  const st = soccertips.value;
  const sa = statarea.value ?? [];

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 font-mono text-xs">
      <h1 className="text-lg font-bold mb-1">Scrape Status</h1>
      <p className="text-muted-foreground mb-8">Diagnostic only -- not a product page. Fetches live every visit, no caching.</p>

      {/* ---------- PredictZ ---------- */}
      <Section
        title="PredictZ (ZenRows + Gemini)"
        summary={`${pz?.predictions.length ?? 0} predictions via ${pzd?.method ?? 'none'} (${(predictz.ms / 1000).toFixed(1)}s)`}
        error={predictz.error ?? (pz && !pz.rawText ? 'ZenRows returned nothing -- check credits/API key' : null)}
      >
        {pzd && (
          <Facts
            items={[
              ['"MATCH PREVIEW" scores on page', pzd.previewScoreTokens],
              ['old regex: team/odds pairs', pzd.regexPairs],
              ['old regex result', pzd.regexCount],
              ['AI returned', pzd.aiReturned],
              ['AI rejected', pzd.aiRejected],
              ['AI valid', pzd.aiValid],
              ['AI error', pzd.aiError],
            ]}
          />
        )}
        <Box>
          {(pz?.predictions.length ?? 0) === 0 && (
            <p className="text-muted-foreground">Parsed 0 predictions. Open the raw text below: if it is the real page, the AI error above says why; if it is an error/blocked page, ZenRows is the problem.</p>
          )}
          {pz?.predictions.map((p, i) => (
            <div key={i} className="border-b border-border/50 pb-1.5">
              {p.homeTeam} v {p.awayTeam} &mdash; predicted {p.predictedScore ? `${p.predictedScore.home}-${p.predictedScore.away}` : 'none'}
            </div>
          ))}
        </Box>
        <Raw title="PredictZ raw text" text={pz?.rawText ?? null} />
      </Section>

      {/* ---------- Vitibet ---------- */}
      <Section
        title="Vitibet (plain HTML + Gemini)"
        summary={`${vt?.predictions.length ?? 0} predictions (${(vitibet.ms / 1000).toFixed(1)}s)`}
        error={vitibet.error ?? vt?.error ?? null}
      >
        {vt && (
          <Facts
            items={[
              ['HTML chars', vt.htmlLength],
              ['fixture links', vt.diagnostics.linkRows],
              ['rows with a score', vt.diagnostics.rowsWithScore],
              ['regex parsed', vt.diagnostics.ruleParsed],
              ['AI returned', vt.diagnostics.aiReturned],
              ['AI rejected', vt.diagnostics.aiRejected],
              ['names from AI', vt.diagnostics.aiUsed],
              ['AI/regex score mismatch', vt.diagnostics.scoreMismatches],
              ['AI/regex name differences', vt.diagnostics.nameDiffs],
              ['AI error', vt.diagnostics.aiError],
            ]}
          />
        )}
        {vt && vt.diagnostics.nameDiffSamples.length > 0 && (
          <details className="mb-2">
            <summary className="cursor-pointer">Name differences between regex and AI (sample)</summary>
            <div className="mt-1 whitespace-pre-wrap break-words">{vt.diagnostics.nameDiffSamples.join('\n')}</div>
          </details>
        )}
        <Box>
          {(vt?.predictions.length ?? 0) === 0 && <p className="text-muted-foreground">Parsed 0 predictions. Sample rows below show what the page gave us.</p>}
          {vt?.predictions.map((p) => (
            <div key={p.fixtureId} className="border-b border-border/50 pb-1.5">
              {p.homeTeam} v {p.awayTeam} &mdash; {p.predictedScore.home}-{p.predictedScore.away}{' '}
              <span className="text-muted-foreground">(fixture {p.fixtureId}, league {p.leagueId ?? '?'})</span>
            </div>
          ))}
        </Box>
        <Raw title="Vitibet sample rows (as sent to AI)" text={vt?.sampleRows.join('\n') ?? null} />
      </Section>

      {/* ---------- SoccerTips ---------- */}
      <Section
        title="SoccerTips (plain HTML + Gemini)"
        summary={`${st?.predictions.length ?? 0} predictions (${(soccertips.ms / 1000).toFixed(1)}s)`}
        error={soccertips.error ?? st?.error ?? null}
      >
        {st && (
          <Facts
            items={[
              ['text chars', st.textLength],
              ['match blocks', st.diagnostics.matchBlocks],
              ['AI returned', st.diagnostics.aiReturned],
              ['AI rejected', st.diagnostics.aiRejected],
              ['AI/regex score mismatch', st.diagnostics.scoreMismatches],
              ['names from AI', st.diagnostics.namesFromAi],
              ['names from rule (no AI)', st.diagnostics.namesFromRule],
              ['AI error', st.diagnostics.aiError],
            ]}
          />
        )}
        <Box>
          {(st?.predictions.length ?? 0) === 0 && <p className="text-muted-foreground">Parsed 0 predictions. Sample blocks below show what the page gave us.</p>}
          {st?.predictions.map((p, i) => (
            <div key={i} className="border-b border-border/50 pb-1.5">
              {p.homeTeam} v {p.awayTeam} &mdash; {p.predictedScore.home}-{p.predictedScore.away}
            </div>
          ))}
        </Box>
        <Raw title="SoccerTips sample blocks (as sent to AI)" text={st?.sampleBlocks.join('\n') ?? null} />
      </Section>

      {/* ---------- Statarea ---------- */}
      <Section title="Statarea (plain HTML, percentages)" summary={`${sa.length} predictions (${(statarea.ms / 1000).toFixed(1)}s)`} error={statarea.error}>
        <Box>
          {sa.length === 0 && !statarea.error && (
            <p className="text-muted-foreground">Fetched but parsed 0 predictions -- blocked from this server, or the text pattern no longer matches the layout.</p>
          )}
          {sa.map((p, i) => (
            <div key={i} className="border-b border-border/50 pb-1.5">
              {p.date} {p.time} &mdash; {p.homeTeam} v {p.awayTeam} &mdash; 1:{p.homeWinPercent}% X:{p.drawPercent}% 2:{p.awayWinPercent}% | O2.5:{p.over25Percent}% | BTTS:{p.bttsYesPercent}%
            </div>
          ))}
        </Box>
      </Section>
    </div>
  );
}
