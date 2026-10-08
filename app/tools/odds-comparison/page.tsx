import { Metadata } from 'next';
import { ToolPageShell } from '@/components/tools/ToolPageShell';
import { OddsCompareForm } from '@/components/tools/OddsCompareForm';

export const metadata: Metadata = {
  title: 'Odds Comparison',
  description: 'Check SportyBet, Football.com and MSport for a better price on the games you actually have.',
};

export default function Page() {
  return (
    <ToolPageShell
      title="Odds Comparison"
      tagline="Check platforms for a better price on the games you actually have."
      status="live"
      howItWorks={
        <p>
          Paste a booking code. For each pick we look up the exact same game and market on the other
          platforms and show the price on each, plus which platform pays the most for the whole slip.
          Prices are fetched on demand, nothing is stored.
        </p>
      }
      faq={[
        {
          question: 'Which platforms are compared?',
          answer:
            'SportyBet, Football.com and MSport, which share the same game and market IDs. More platforms will be added as they can be matched reliably.',
        },
        {
          question: 'Why does a pick show a dash?',
          answer:
            'That platform does not offer the market, or it has closed. The best-slip total only counts platforms that can price every pick.',
        },
      ]}
      body={<OddsCompareForm />}
    />
  );
}
