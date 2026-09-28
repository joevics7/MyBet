import { Metadata } from 'next';
import { ToolPageShell } from '@/components/tools/ToolPageShell';

export const metadata: Metadata = {
  title: 'Daily AI Predictor',
  description: "Five daily tickets, one per odds band, built from the day's highest-confidence selections.",
};

export default function Page() {
  return (
    <ToolPageShell
      title="Daily AI Predictor"
      tagline="Five daily tickets, one per odds band, built from the day's highest-confidence selections."
      status="soon"
      howItWorks={<p>Each morning, every viable market on the day&rsquo;s fixtures is scored by the Confidence Engine. Five tickets are published, one per target odds band, each built from the highest-confidence combination available. Statistical analysis, not a guarantee.</p>}
      body={
        <div className="rounded-sm border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Coming soon</p>
          <p className="mt-1.5">
            This tool goes live once the Decode Service ships for its first platform. Check the
            Telegram bot for launch updates.
          </p>
        </div>
      }
    />
  );
}
