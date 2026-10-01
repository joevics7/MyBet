import { Metadata } from 'next';
import { ToolPageShell } from '@/components/tools/ToolPageShell';
import { DecoderForm } from '@/components/tools/DecoderForm';

export const metadata: Metadata = {
  title: 'Booking Code Decoder + Confidence Score',
  description: 'Paste a code, see every selection scored for risk before you commit.',
};

export default function Page() {
  return (
    <ToolPageShell
      title="Booking Code Decoder + Confidence Score"
      tagline="Paste a code, see every selection scored for risk before you commit."
      status="live"
      howItWorks={
        <p>
          Paste a booking code and the Decode Service resolves it into its games and markets,
          with a 0-100 confidence score from the Confidence Engine next to each one where
          available. SportyBet and Bet9ja are live now; more platforms are being added. A score
          of &ldquo;—&rdquo; means that specific fixture isn&rsquo;t covered by our data source
          yet (common for lower-division and international matches) — not a 0.
        </p>
      }
      body={<DecoderForm />}
    />
  );
}
