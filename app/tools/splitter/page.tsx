import { Metadata } from 'next';
import { ToolPageShell } from '@/components/tools/ToolPageShell';

export const metadata: Metadata = {
  title: 'Bet Splitter by Risk',
  description: 'Break a big ticket into risk-tiered slips, automatically or by hand.',
};

export default function Page() {
  return (
    <ToolPageShell
      title="Bet Splitter by Risk"
      tagline="Break a big ticket into risk-tiered slips, automatically or by hand."
      status="soon"
      howItWorks={<p>Every selection in a decoded ticket is scored, then grouped into Safe, Medium, and Risky slips automatically -- or split evenly, or by market type. Drag selections between slips before generating.</p>}
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
