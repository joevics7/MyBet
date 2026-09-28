import { Metadata } from 'next';
import { ToolPageShell } from '@/components/tools/ToolPageShell';

export const metadata: Metadata = {
  title: 'Odds Comparison',
  description: 'Check 2-4 platforms for a better price on the games you actually have.',
};

export default function Page() {
  return (
    <ToolPageShell
      title="Odds Comparison"
      tagline="Check 2-4 platforms for a better price on the games you actually have."
      status="soon"
      howItWorks={<p>For each game and market in a decoded ticket, the Odds Lookup Service checks a handful of platforms on demand and highlights the best price -- no continuous scraping.</p>}
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
