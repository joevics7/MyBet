import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Scale } from 'lucide-react';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://betmeter.com';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms and conditions that govern your use of BetMeter\u2019s website, tools, and Telegram bot.',
  alternates: { canonical: `${siteUrl}/terms` },
  openGraph: {
    title: 'Terms of Service | BetMeter',
    description: 'The terms and conditions that govern your use of BetMeter.',
    url: `${siteUrl}/terms`,
    type: 'website',
  },
};

export default function TermsPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-14">
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-6 font-mono" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-[hsl(var(--verified))] transition-colors">Home</Link>
        <ChevronRight className="h-3 w-3" />
        <span>Terms of Service</span>
      </nav>

      <div className="flex items-center gap-2 mb-2">
        <Scale className="h-4.5 w-4.5 text-[hsl(var(--seal))]" />
        <span className="text-xs font-mono font-semibold tracking-widest text-[hsl(var(--verified))] uppercase">Legal</span>
      </div>
      <h1 className="font-serif text-3xl md:text-4xl font-semibold mb-1">Terms of Service</h1>
      <p className="text-xs text-muted-foreground mb-10">Last updated: September 2026</p>

      <div className="max-w-2xl prose prose-sm dark:prose-invert space-y-8 text-sm text-muted-foreground leading-relaxed">
        <section>
          <h2 className="text-base font-bold text-foreground mb-2">1. Acceptance of terms</h2>
          <p>
            By accessing or using betmeter.com or the BetMeter Telegram bot (&ldquo;BetMeter&rdquo;,
            &ldquo;we&rdquo;, &ldquo;us&rdquo;), you agree to be bound by these Terms of Service.
            If you do not agree, please stop using the service.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-foreground mb-2">2. What BetMeter provides</h2>
          <p>BetMeter is a booking-code tools platform. We provide:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>A booking code decoder with a per-selection confidence score</li>
            <li>A booking code converter and bet splitter</li>
            <li>An on-demand odds comparison tool</li>
            <li>A code vault with automatic result checking</li>
            <li>A stake-sizing calculator</li>
            <li>A daily, automatically generated ticket predictor</li>
          </ul>
          <p className="mt-3 bg-muted/40 border border-border p-3 rounded-sm text-xs">
            <strong>Important:</strong> BetMeter is not a bookmaker, does not accept or place
            bets, and does not hold funds. Confidence scores and predictor tickets are
            statistical analysis based on form and historical data — never a guarantee of any
            outcome. You are solely responsible for any betting decision you make.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-foreground mb-2">3. Eligibility</h2>
          <p>
            You must be of legal gambling age in your jurisdiction to use BetMeter, and you are
            responsible for ensuring that using booking-code and betting tools is lawful where
            you live. If it isn&rsquo;t, don&rsquo;t use the service.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-foreground mb-2">4. Accuracy of information</h2>
          <p>
            We make every effort to keep decoded slips, confidence scores, and odds data accurate
            and current, but third-party platforms and data providers can change or go stale
            without notice. BetMeter does not guarantee that any score, price, or result on this
            site is current or applicable to your specific situation.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-foreground mb-2">5. Intellectual property</h2>
          <p>
            All content on this site — including tool designs, graphics, and the BetMeter brand —
            is owned by BetMeter. You may not reproduce, republish, or commercially exploit it
            without our written permission. Linking to our pages for non-commercial purposes is
            welcome.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-foreground mb-2">6. Prohibited conduct</h2>
          <p>When using BetMeter, you agree not to:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Scrape, crawl, or use automated tools to extract data from the site or bot beyond normal use</li>
            <li>Attempt to access, overload, or interfere with our servers or API endpoints</li>
            <li>Use the tools for any unlawful purpose</li>
            <li>Resell or redistribute decoded, converted, or scored data as your own product</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-bold text-foreground mb-2">7. Third-party links</h2>
          <p>
            BetMeter links to third-party betting platforms and data providers, some via
            affiliate arrangements (see our{' '}
            <Link href="/privacy" className="text-[hsl(var(--verified))] underline">Privacy Policy</Link>).
            We&rsquo;re not responsible for the content, accuracy, or practices of any
            third-party site.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-foreground mb-2">8. Limitation of liability</h2>
          <p>
            To the fullest extent permitted by law, BetMeter and its team will not be liable for
            any loss — including financial loss from a betting decision, reliance on a confidence
            score or predictor ticket, or a conversion/decode error — arising from your use of
            this site or bot.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-foreground mb-2">9. Changes to these terms</h2>
          <p>
            We may update these Terms at any time. Changes take effect as soon as they are
            posted; continued use after that constitutes acceptance of the revised terms.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-foreground mb-2">10. Governing law</h2>
          <p>
            These Terms are governed by the laws of the Federal Republic of Nigeria. Disputes
            arising from use of this site are subject to the jurisdiction of Nigerian courts.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-foreground mb-2">11. Contact</h2>
          <p>
            For questions about these Terms, contact us via our{' '}
            <Link href="/contact" className="text-[hsl(var(--verified))] underline">Contact page</Link>.
          </p>
        </section>
      </div>
    </div>
  );
}
