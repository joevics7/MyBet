import { fetchStatareaPredictions } from '@/lib/services/statarea';
import { fetchPredictzPredictions } from '@/lib/services/predictz';

// Diagnostic page, not a product feature -- not linked from nav. Shows
// exactly what each tipster scraper fetched and parsed, in plain
// readable form, so this can be confirmed by visiting a URL rather than
// needing dev tools or API calls. Always fetches fresh (no caching) --
// each visit costs real Statarea + ZenRows requests, so don't link this
// publicly or refresh it repeatedly without reason.
export const dynamic = 'force-dynamic';

export default async function ScrapeStatusPage() {
  const [statareaResult, predictzResult] = await Promise.allSettled([
    fetchStatareaPredictions(),
    fetchPredictzPredictions(),
  ]);

  const statarea = statareaResult.status === 'fulfilled' ? statareaResult.value : [];
  const statareaError = statareaResult.status === 'rejected' ? String(statareaResult.reason) : null;

  const predictz = predictzResult.status === 'fulfilled' ? predictzResult.value : [];
  const predictzError = predictzResult.status === 'rejected' ? String(predictzResult.reason) : null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 font-mono text-xs">
      <h1 className="text-lg font-bold mb-1">Scrape Status</h1>
      <p className="text-muted-foreground mb-8">
        Diagnostic only -- not a product page. Fetches live every visit, no caching.
      </p>

      <section className="mb-10">
        <h2 className="font-bold mb-2">
          Statarea &mdash; {statarea.length} predictions fetched
          {statareaError && <span className="text-[hsl(var(--rust))]"> (ERROR: {statareaError})</span>}
        </h2>
        <div className="space-y-1.5 max-h-[600px] overflow-auto border border-border rounded-sm p-3 bg-card">
          {statarea.length === 0 && !statareaError && (
            <p className="text-muted-foreground">
              Fetched successfully but parsed 0 predictions -- the text pattern likely doesn&rsquo;t
              match Statarea&rsquo;s current page layout anymore.
            </p>
          )}
          {statarea.map((p, i) => (
            <div key={i} className="border-b border-border/50 pb-1.5">
              {p.date} {p.time} &mdash; {p.homeTeam} v {p.awayTeam} &mdash; 1:{p.homeWinPercent}% X:
              {p.drawPercent}% 2:{p.awayWinPercent}% | O2.5:{p.over25Percent}% | BTTS:{p.bttsYesPercent}%
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-bold mb-2">
          Predictz &mdash; {predictz.length} predictions fetched
          {predictzError && <span className="text-[hsl(var(--rust))]"> (ERROR: {predictzError})</span>}
        </h2>
        <div className="space-y-1.5 max-h-[600px] overflow-auto border border-border rounded-sm p-3 bg-card">
          {predictz.length === 0 && !predictzError && (
            <p className="text-muted-foreground">
              Fetched successfully but parsed 0 predictions -- either ZenRows returned something
              other than the real page (check ZENROWS_API_KEY and credit balance), or the parser
              pattern doesn&rsquo;t match predictz&rsquo;s real current layout. Check Vercel logs
              for &ldquo;[predictz]&rdquo; for the specific reason.
            </p>
          )}
          {predictz.map((p, i) => (
            <div key={i} className="border-b border-border/50 pb-1.5">
              {p.homeTeam} v {p.awayTeam} &mdash; predicted score:{' '}
              {p.predictedScore ? `${p.predictedScore.home}-${p.predictedScore.away}` : 'none parsed'}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
