import { Metadata } from 'next';
import { ToolPageShell } from '@/components/tools/ToolPageShell';
import { OddsExplorer } from '@/components/tools/OddsExplorer';

export const metadata: Metadata = {
  title: 'Odds Comparison',
  description: 'See the odds for any match across bookmakers worldwide, side by side.',
};

export default function Page() {
  return (
    <ToolPageShell
      title="Odds Comparison"
      tagline="See a match's odds across bookmakers, side by side."
      status="live"
      howItWorks={
        <p>
          Pick a day, tap a match, and see the odds each bookmaker offers for the result, total goals and both
          teams to score. The best price in each column is highlighted. Odds are fetched on demand and nothing
          is stored.
        </p>
      }
      faq={[
        {
          question: 'Which bookmakers are shown?',
          answer:
            'Hundreds of bookmakers worldwide through an odds data provider, plus Betway Nigeria directly. Coverage varies by match, and not every bookmaker accepts customers in every country.',
        },
        {
          question: 'Why is a price missing?',
          answer: 'That bookmaker does not offer that market for the match, or it is currently suspended.',
        },
        {
          question: 'Can I place a bet here?',
          answer: 'No. This page only compares prices. Open the bookmaker to bet, and check the odds there first.',
        },
      ]}
      body={<OddsExplorer />}
    />
  );
}
