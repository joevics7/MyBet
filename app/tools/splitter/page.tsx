import { Metadata } from 'next';
import { ToolPageShell } from '@/components/tools/ToolPageShell';
import { SplitterForm } from '@/components/tools/SplitterForm';

export const metadata: Metadata = {
  title: 'Bet Splitter by Risk',
  description: 'Break a big ticket into risk-tiered slips, automatically or by hand.',
};

export default function Page() {
  return (
    <ToolPageShell
      title="Bet Splitter by Risk"
      tagline="Break a big ticket into risk-tiered slips, automatically or by hand."
      status="live"
      howItWorks={
        <>
          <p>
            Paste a SportyBet booking code and choose how to split it: by risk (Safe/Medium/Risky,
            based on each selection&rsquo;s confidence score where available), evenly across a
            number of slips, or grouped by market type.
          </p>
          <p>
            Not every selection can be scored — international and lower-division fixtures often
            aren&rsquo;t covered by our data source yet and show as ungraded rather than a guessed
            number. Generating new booking codes for each split slip is still in progress; for now
            you&rsquo;ll see the grouped selections even where a new code isn&rsquo;t available yet.
          </p>
        </>
      }
      body={<SplitterForm />}
    />
  );
}
