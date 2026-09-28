import { Metadata } from 'next';
import { ToolPageShell } from '@/components/tools/ToolPageShell';

export const metadata: Metadata = {
  title: 'Smart Stake Calculator',
  description: 'Confidence-driven fractional Kelly sizing, with hard guardrails.',
};

export default function Page() {
  return (
    <ToolPageShell
      title="Smart Stake Calculator"
      tagline="Confidence-driven fractional Kelly sizing, with hard guardrails."
      status="soon"
      howItWorks={<p>Your ticket's confidence score is converted into an implied edge against its combined odds, then run through a fractional Kelly formula to suggest a stake -- capped well below what the math alone would allow.</p>}
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
