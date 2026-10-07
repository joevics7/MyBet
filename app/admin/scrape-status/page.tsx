import { fetchStatareaPredictions } from '@/lib/services/statarea';
import { fetchPredictzRawText } from '@/lib/services/predictz';
import { fetchForebetRawText } from '@/lib/services/forebet';

// Diagnostic page, not a product feature -- not linked from nav. Statarea
// shows structured parsed output (confirmed working). Predictz and
// Forebet show RAW fetched text, not parsed -- intentional: a parser
// should never be written against a layout nobody has actually looked
// at (predictz's first attempt did exactly that and reliably returned 0
// results). Look at the raw text here first, then build the real parser.
// Always fetches fresh (no caching) -- each visit costs real Statarea +
// ZenRows requests, so don't link this publicly or refresh repeatedly
// without reason.
export const dynamic = 'force-dynamic';

function RawTextSection({
  title,
  text,
  error,
}: {
  title: string;
  text: string | null;
  error: string | null;
}) {
  return (
    <section className="mb-10">
      <h2 className="font-bold mb-2">
        {title} &mdash; {text ? `${text.length} chars fetched (raw, unparsed)` : 'fetch failed'}
        {error && <span className="text-[hsl(var(--rust))]"> (ERROR: {error})</span>}
      </h2>
      <div className="max-h-[600px] overflow-auto border border-border rounded-sm p-3 bg-card whitespace-pre-wrap break-words">
        {text ? text.slice(0, 15000) : <span className="text-muted-foreground">No content.</span>}
        {text && text.length > 15000 && (
          <p className="text-muted-foreground mt-2">... truncated, {text.length - 15000} more chars</p>
        )}
      </div>
    </section>
  );
}

export default async function ScrapeStatusPage() {
  const [statareaResult, predictzResult, forebetResult] = await Promise.allSettled([
    fetchStatareaPredictions(),
    fetchPredictzRawText(),
    fetchForebetRawText(),
  ]);

  const statarea = statareaResult.status === 'fulfilled' ? statareaResult.value : [];
  const statareaError = statareaResult.status === 'rejected' ? String(statareaResult.reason) : null;

  const predictzText = predictzResult.status === 'fulfilled' ? predictzResult.value : null;
  const predictzError = predictzResult.status === 'rejected' ? String(predictzResult.reason) : null;

  const forebetText = forebetResult.status === 'fulfilled' ? forebetResult.value : null;
  const forebetError = forebetResult.status === 'rejected' ? String(forebetResult.reason) : null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 font-mono text-xs">
      <h1 className="text-lg font-bold mb-1">Scrape Status</h1>
      <p className="text-muted-foreground mb-8">
        Diagnostic only -- not a product page. Fetches live every visit, no caching.
      </p>

      <section className="mb-10">
        <h2 className="font-bold mb-2">
          Statarea &mdash; {statarea.length} predictions fetched (structured, parsed)
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

      <RawTextSection title="Predictz" text={predictzText} error={predictzError} />
      <RawTextSection title="Forebet" text={forebetText} error={forebetError} />
    </div>
  );
}
