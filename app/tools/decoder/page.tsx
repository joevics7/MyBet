import { Metadata } from 'next';
import { ToolPageShell } from '@/components/tools/ToolPageShell';

export const metadata: Metadata = {
  title: 'Booking Code Decoder + Confidence Score',
  description: 'Paste a code, see every selection scored for risk before you commit.',
};

export default function Page() {
  return (
    <ToolPageShell
      title="Booking Code Decoder + Confidence Score"
      tagline="Paste a code, see every selection scored for risk before you commit."
      status="soon"
      howItWorks={<p>Paste a booking code, and the Decode Service resolves it into its games and markets. The Confidence Engine then scores every selection 0-100, with a one-line reason for each score.</p>}
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
