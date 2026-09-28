import { Metadata } from 'next';
import { ToolPageShell } from '@/components/tools/ToolPageShell';

export const metadata: Metadata = {
  title: 'Bet Code Vault + Auto Result Checker',
  description: 'Save a code once -- get a plain-language result when every leg settles.',
};

export default function Page() {
  return (
    <ToolPageShell
      title="Bet Code Vault + Auto Result Checker"
      tagline="Save a code once -- get a plain-language result when every leg settles."
      status="soon"
      howItWorks={<p>Save any code to your vault. An hourly check compares it against the Fixture/Results Feed and updates its status once every leg has finished -- wins and losses reported with equal weight.</p>}
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
