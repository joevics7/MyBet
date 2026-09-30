import { CheckCircle2 } from 'lucide-react';

export interface PredictorSelection {
  home_team: string;
  away_team: string;
  competition: string | null;
  market: string;
  score: number;
  model_odds: number;
  reason: string | null;
  kickoff_at: string | null;
}

export interface PredictorTicket {
  id: string;
  target_band: number;
  combined_odds: number;
  avg_confidence: number;
  selections: PredictorSelection[];
}

function scoreColor(score: number): string {
  if (score >= 70) return 'text-[hsl(var(--verified))]';
  if (score >= 40) return 'text-amber-600';
  return 'text-[hsl(var(--rust))]';
}

function TicketCard({ ticket }: { ticket: PredictorTicket }) {
  return (
    <div className="rounded-sm border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-[hsl(var(--seal))]" />
          <p className="font-serif font-semibold">Target odds ~{ticket.target_band}</p>
        </div>
        <span className="text-xs font-mono text-muted-foreground">
          Combined: {ticket.combined_odds.toFixed(2)} &middot; Avg confidence: {Math.round(ticket.avg_confidence)}
        </span>
      </div>
      <div className="space-y-2">
        {ticket.selections.map((s, i) => (
          <div key={i} className="rounded-sm border border-border px-3.5 py-2.5">
            <div className="flex items-center justify-between">
              <p className="text-sm">
                {s.home_team} v {s.away_team}
                {s.competition && <span className="text-muted-foreground"> &middot; {s.competition}</span>}
              </p>
              <span className={`text-xs font-mono font-semibold ${scoreColor(s.score)}`}>{s.score}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {s.market} &middot; model odds {s.model_odds.toFixed(2)}
            </p>
            {s.reason && <p className="text-xs text-muted-foreground mt-1">{s.reason}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PredictorTickets({ tickets }: { tickets: PredictorTicket[] }) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground bg-muted/40 border border-border rounded-sm px-3 py-2">
        &ldquo;Odds&rdquo; here are our own model&rsquo;s implied fair odds (1 / estimated probability),
        not a live bookmaker price -- they won&rsquo;t exactly match what you find on a betting platform.
        Statistical analysis, not a guarantee.
      </p>
      {tickets.map((ticket) => (
        <TicketCard key={ticket.id} ticket={ticket} />
      ))}
    </div>
  );
}
