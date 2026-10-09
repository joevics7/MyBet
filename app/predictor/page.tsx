import { Metadata } from 'next';
import { ToolPageShell } from '@/components/tools/ToolPageShell';
import { PredictorTickets, type PredictorTicket, type PredictorSelection } from '@/components/tools/PredictorTickets';
import { supabase } from '@/lib/supabase';

export const revalidate = 3600; // tickets only change once/day, via the cron job

export const metadata: Metadata = {
  title: 'Daily AI Predictor',
  description: "Five daily tickets, one per odds band, built from the day's highest-confidence selections.",
};

async function getTodaysTickets(): Promise<PredictorTicket[] | null> {
  if (!supabase) return null; // Supabase not configured yet

  const today = new Date().toISOString().slice(0, 10);

  const { data: tickets } = await supabase
    .from('predictor_tickets')
    .select('*')
    .eq('ticket_date', today)
    .order('target_band', { ascending: true });

  if (!tickets || tickets.length === 0) return [];

  const { data: selections } = await supabase
    .from('predictor_ticket_selections')
    .select('*')
    .in(
      'ticket_id',
      tickets.map((t) => t.id),
    );

  return tickets.map((t) => ({
    ...t,
    selections: (selections ?? []).filter(
      (s): s is PredictorSelection & { ticket_id: string } => s.ticket_id === t.id,
    ),
  }));
}

export default async function Page() {
  const tickets = await getTodaysTickets();
  const hasTickets = tickets !== null && tickets.length > 0;

  return (
    <ToolPageShell
      title="Daily AI Predictor"
      tagline="Five daily tickets, one per odds band, built from the day's highest-confidence selections."
      status={hasTickets ? 'live' : 'soon'}
      howItWorks={
        <p>
          Each morning, the day&rsquo;s games and their real bookmaker odds are scored by the same
          Confidence Engine as the Decoder, using each team&rsquo;s recent form. Up to five tickets are
          published, one per target odds band (1.5 / 2 / 3 / 4 / 5), each built from the
          highest-confidence combination available, with a short written analysis for every pick. A
          light fixture day may publish fewer than five. Statistical analysis, not a guarantee.
        </p>
      }
      body={
        tickets === null ? (
          <div className="rounded-sm border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Not connected yet</p>
            <p className="mt-1.5">The Predictor needs Supabase configured to store and show tickets.</p>
          </div>
        ) : tickets.length === 0 ? (
          <div className="rounded-sm border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">No tickets published yet today</p>
            <p className="mt-1.5">
              The Predictor runs each morning. Check back after it&rsquo;s run, or if it&rsquo;s
              already run today, today may have been too light a fixture day for a confident pick
              in any band.
            </p>
          </div>
        ) : (
          <PredictorTickets tickets={tickets} />
        )
      }
    />
  );
}
