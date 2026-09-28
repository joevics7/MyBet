import { Metadata } from 'next';
import { ToolPageShell } from '@/components/tools/ToolPageShell';
import { GpaCalculatorNg } from '@/components/tools/GpaCalculatorNg';

export const metadata: Metadata = {
  title: 'Nigerian University GPA Calculator (5.0 Scale)',
  description: 'Calculate your semester and cumulative GPA on the Nigerian 5.0 grading scale, and see your projected class of degree.',
};

const FAQ = [
  {
    question: 'Does this work for the 4.0 scale too?',
    answer:
      'This version uses the 5.0 scale used by most Nigerian federal and state universities. If your school grades on a 4.0 scale, use the 4.0 GPA Calculator instead — the grade point mapping differs.',
  },
  {
    question: 'What grade points does this use?',
    answer: 'A = 5, B = 4, C = 3, D = 2, E = 1, F = 0, matching the standard Nigerian 5-point grading scale.',
  },
  {
    question: 'How is class of degree determined?',
    answer:
      'Most Nigerian universities classify First Class at 4.50+, Second Class Upper at 3.50–4.49, Second Class Lower at 2.40–3.49, Third Class at 1.50–2.39, and Pass below that — though exact cutoffs vary slightly by institution.',
  },
];

export default function Page() {
  return (
    <ToolPageShell
      country={{ name: 'Nigeria', flag: '🇳🇬', slug: 'nigeria' }}
      category="GPA & Grade Calculators"
      title="University GPA Calculator (5.0 Scale)"
      tagline="Enter your course units and grades to calculate your semester GPA and projected class of degree."
      calculator={<GpaCalculatorNg />}
      howItWorks={
        <p>
          Each course&rsquo;s grade is converted to a grade point (A=5 down to F=0), multiplied
          by its unit load, and summed. Dividing total grade points by total units gives your
          GPA on the 5.0 scale used by most Nigerian universities.
        </p>
      }
      faq={FAQ}
      officialSourceName="National Universities Commission (NUC) grading guideline"
      officialSourceUrl="https://www.nuc.edu.ng"
      lastReviewed="4 Aug 2026"
    />
  );
}
