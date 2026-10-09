import { Metadata } from 'next';
import { ToolPageShell } from '@/components/tools/ToolPageShell';
import { ConverterForm } from '@/components/tools/ConverterForm';

export const metadata: Metadata = {
  title: 'Booking Code Converter + Smart Filter',
  description: 'Move a slip from one platform to another without losing selections.',
};

export default function Page() {
  return (
    <ToolPageShell
      title="Booking Code Converter + Smart Filter"
      tagline="Move a slip from one platform to another without losing selections."
      status="live"
      howItWorks={
        <p>
          Paste a code, choose where it came from and where you want it. Each pick is matched to the same game and
          market on the target platform, and you get a new booking code to load there. The Smart Filter can first
          remove games that have already started, and every pick is shown with its confidence score so you can spot
          the risky ones. Anything that can't be matched is
          listed with the reason, and the rest still converts.
        </p>
      }
      faq={[
        {
          question: 'Which platforms can I convert to?',
          answer:
            'SportyBet, Football.com, MSport and Betway. You can convert from more platforms than that, including Bangbet and Stake links, but those do not give us a way to create a new code yet.',
        },
        {
          question: 'Why did some picks not convert?',
          answer:
            'The other platform may not offer that market, may list the game differently, or the pick is a type we do not match yet. Win/draw/win, over/under and both-teams-to-score picks convert best. Same-family conversions (SportyBet, Football.com, MSport) are the most exact.',
        },
        {
          question: 'Will the odds be the same?',
          answer: 'Not always. Each platform sets its own prices, so we show the new price beside the old one for every pick.',
        },
      ]}
      body={<ConverterForm />}
    />
  );
}
