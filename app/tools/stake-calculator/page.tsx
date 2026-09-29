import { Metadata } from 'next';
import { ToolPageShell } from '@/components/tools/ToolPageShell';
import { StakeCalculatorForm } from '@/components/tools/StakeCalculatorForm';

export const metadata: Metadata = {
  title: 'Smart Stake Calculator',
  description: 'Confidence-driven fractional Kelly sizing, with hard guardrails.',
};

export default function Page() {
  return (
    <ToolPageShell
      title="Smart Stake Calculator"
      tagline="Confidence-driven fractional Kelly sizing, with hard guardrails."
      status="live"
      howItWorks={
        <>
          <p>
            Enter your bankroll, then each selection&rsquo;s odds and a confidence score (from
            the Decoder once it&rsquo;s scored, or your own estimate). The calculator converts
            that into an implied win probability, compares it against the odds to estimate your
            edge, and applies a fractional Kelly formula — never full Kelly, and never above a
            10% hard ceiling regardless of what the math suggests.
          </p>
          <p>
            If you have more than one selection, you&rsquo;ll see both a combined-ticket
            recommendation (if placing them together as one accumulator) and a separate
            recommendation per selection (if placing each as its own bet).
          </p>
        </>
      }
      faq={[
        {
          question: 'Why not just recommend full Kelly?',
          answer:
            'Full Kelly is mathematically optimal for long-run growth but extremely volatile in practice -- a single bad estimate can wipe out a large chunk of bankroll. Quarter and half Kelly trade some growth for much lower variance, which is the safer default for most people.',
        },
        {
          question: 'What if my confidence score is very high?',
          answer:
            'The recommendation is still capped at 10% of your bankroll, no matter how high the estimated edge is. An unusually large suggested stake is a sign to double-check your inputs, not a reason to bet more.',
        },
      ]}
      body={<StakeCalculatorForm />}
    />
  );
}
