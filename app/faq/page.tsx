import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, HelpCircle, Send, Mail, Gauge, ShieldCheck, Archive } from 'lucide-react';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://betmeter.com';
const TELEGRAM_BOT_URL = process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL || 'https://t.me/BetsMeterBot';
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@betmeter.com';

export const metadata: Metadata = {
  title: 'Frequently Asked Questions',
  description: 'How BetMeter\u2019s confidence score works, which platforms are supported, and how the tools and Telegram bot fit together.',
  alternates: { canonical: `${siteUrl}/faq` },
  openGraph: {
    title: 'BetMeter — Frequently Asked Questions',
    description: 'How the confidence score works, which platforms are supported, and how the tools fit together.',
    url: `${siteUrl}/faq`,
    type: 'website',
  },
};

const FAQ_ITEMS = [
  {
    question: 'What is BetMeter?',
    answer: 'BetMeter is a set of booking-code tools — decode, convert, split, compare odds, vault, and size a stake — all built on one confidence-scoring engine, available as a Telegram bot and on the web.',
  },
  {
    question: 'How is the confidence score calculated?',
    answer: 'Each selection is scored 0-100 from recent form, head-to-head record, and other match stats. Scores are cached for 24 hours per game and market. When there isn\u2019t enough data for a market, the tool says so rather than showing a made-up number.',
  },
  {
    question: 'Is BetMeter a bookmaker or does it place bets for me?',
    answer: 'No. BetMeter doesn\u2019t take bets, hold funds, or set odds. It reads booking codes and public data, and hands you back a decoded, scored, or converted slip that you take to your own betting platform.',
  },
  {
    question: 'Which betting platforms are supported?',
    answer: 'Support is added platform by platform, starting with the highest-traffic ones. Check the tools page for the current list — a platform showing as unsupported for decode/encode is on the roadmap, not ruled out.',
  },
  {
    question: 'How does the Vault\u2019s auto result checker work?',
    answer: 'Save a code and BetMeter checks it hourly against match results, updating its status once every leg has finished. Wins and losses are reported plainly, with no near-miss framing.',
  },
  {
    question: 'Is the Daily Predictor a guarantee?',
    answer: 'No — it\u2019s statistical analysis based on form and confidence scoring, not a guaranteed outcome. Treat every ticket as one input into your own decision, not a certainty.',
  },
];

export default function FAQPage() {
  const jsonLdSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ITEMS.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdSchema) }}
      />

      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-8 font-mono" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-[hsl(var(--verified))] transition-colors">Home</Link>
        <ChevronRight className="h-3 w-3" />
        <span>FAQ</span>
      </nav>

      <div className="max-w-2xl mb-10">
        <p className="text-xs uppercase tracking-[0.14em] font-mono text-[hsl(var(--verified))] mb-2">FAQ</p>
        <h1 className="font-serif text-3xl md:text-4xl font-semibold">Frequently asked questions</h1>
      </div>

      <div className="grid lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2 space-y-4">
          {FAQ_ITEMS.map((faq) => (
            <div key={faq.question} className="border border-border bg-card rounded-sm p-6">
              <div className="flex items-start gap-3">
                <HelpCircle className="h-4.5 w-4.5 text-[hsl(var(--seal))] flex-shrink-0 mt-0.5" strokeWidth={1.75} />
                <div>
                  <h3 className="font-serif font-semibold text-base leading-snug">{faq.question}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{faq.answer}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <div className="border border-border bg-card rounded-sm p-6">
            <h2 className="text-xs font-mono font-semibold uppercase tracking-wide mb-2">Still need help?</h2>
            <p className="text-xs text-muted-foreground leading-relaxed mb-5">
              Not covered above? Reach us directly.
            </p>
            <div className="space-y-3">
              <a
                href={TELEGRAM_BOT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 border border-border rounded-sm hover:border-[hsl(var(--seal))] transition-colors"
              >
                <Send className="h-4.5 w-4.5 text-[hsl(var(--seal))] flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold">Telegram</p>
                  <p className="text-[11px] text-muted-foreground">Fastest response</p>
                </div>
              </a>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="flex items-center gap-3 p-3 border border-border rounded-sm hover:border-[hsl(var(--seal))] transition-colors"
              >
                <Mail className="h-4.5 w-4.5 text-muted-foreground flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold">Email</p>
                  <p className="text-[11px] text-muted-foreground break-all">{SUPPORT_EMAIL}</p>
                </div>
              </a>
            </div>
          </div>

          <div className="p-5 border border-border bg-muted/40 rounded-sm">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="h-4 w-4 text-[hsl(var(--seal))]" />
              <h4 className="text-xs font-mono font-semibold uppercase tracking-wide">Bet responsibly</h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Confidence scores and predictor tickets are decision support, not certainty. Set a
              bankroll you can afford to lose, and use the Vault&rsquo;s running total to keep
              perspective across everything you&rsquo;re tracking.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
