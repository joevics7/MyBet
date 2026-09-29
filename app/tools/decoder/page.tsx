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
      status="soon"
      howItWorks={
        <p>
          Paste a booking code and the Decode Service resolves it into its games and markets.
          SportyBet is live now; more platforms are being added. The Confidence Engine (scoring
          each selection 0-100) is still being built, so results currently show the decoded slip
          without a risk score.
        </p>
      }
      body={<DecoderForm />}
    />
  );
}
