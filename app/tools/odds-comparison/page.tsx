import { Metadata } from 'next';
import { ToolPageShell } from '@/components/tools/ToolPageShell';
import { OddsBoard } from '@/components/tools/OddsBoard';

export const metadata: Metadata = {
  title: 'Odds Comparison',
  description: "Today's football matches with odds from as many bookmakers as possible, side by side.",
};

export default function Page() {
  return (
    <ToolPageShell
      title="Odds Comparison"
      tagline="Today's matches with odds from as many bookmakers as possible."
      status="live"
      howItWorks={
        <p>
          Open the page and every match for the day is already there with its odds. Each bookmaker's own prices are
          used first, and a backup data provider fills in bookmakers and markets we can't read directly. The best price
          in each column is highlighted. Nothing is stored.
        </p>
      }
      faq={[
        {
          question: 'Where do the odds come from?',
          answer:
            "Straight from SportyBet, Football.com and Betway Nigeria where possible, and from an odds data provider for those and for hundreds of other bookmakers. A bookmaker's own price always takes priority over the backup.",
        },
        {
          question: 'Why is a price missing?',
          answer: 'That bookmaker does not offer the market for the match, or it is suspended right now.',
        },
        {
          question: 'Can I bet here?',
          answer: 'No. This page only compares prices. Open the bookmaker to bet, and check the odds there first.',
        },
      ]}
      body={<OddsBoard />}
    />
  );
}
