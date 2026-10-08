import { Metadata } from 'next';
import { ToolPageShell } from '@/components/tools/ToolPageShell';
import { OddsCompareForm } from '@/components/tools/OddsCompareForm';

export const metadata: Metadata = {
  title: 'Odds Comparison',
  description: 'Check bookmakers worldwide for a better price on the games you actually have.',
};

export default function Page() {
  return (
    <ToolPageShell
      title="Odds Comparison"
      tagline="Check platforms for a better price on the games you actually have."
      status="live"
      howItWorks={
        <p>
          Paste a booking code from any supported platform. For each pick we look up the same game and
          market at other bookmakers and show the price on each, which one pays the most for the whole slip,
          and whether the best price looks like good value. Prices are fetched on demand, nothing is stored.
        </p>
      }
      faq={[
        {
          question: 'Which platforms are compared?',
          answer:
            'Directly connected platforms (SportyBet, Football.com, MSport, Betway) plus hundreds of other bookmakers worldwide through an odds data provider. Coverage varies by match and market. Win/draw/win, over/under and both-teams-to-score picks are compared everywhere; other markets only on directly connected platforms.',
        },
        {
          question: 'Why does a pick show a dash?',
          answer:
            'That bookmaker does not offer the market, or it has closed. The best-slip total only counts bookmakers that can price every pick.',
        },
        {
          question: 'What does the value tag mean?',
          answer:
            'It compares our model\'s chance for the pick with the best price available. Pinnacle is a low-margin bookmaker, so when the best price beats its line that is a stronger signal. Neither is a guarantee or betting advice.',
        },
      ]}
      body={<OddsCompareForm />}
    />
  );
}
