import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, ShieldCheck } from 'lucide-react';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://betmeter.com';
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@betmeter.com';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How BetMeter collects, uses, and protects your information across the website and Telegram bot.',
  alternates: { canonical: `${siteUrl}/privacy` },
  openGraph: {
    title: 'Privacy Policy | BetMeter',
    description: 'How BetMeter collects, uses, and protects your information.',
    url: `${siteUrl}/privacy`,
    type: 'website',
  },
};

export default function PrivacyPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-14">
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-6 font-mono" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-[hsl(var(--verified))] transition-colors">Home</Link>
        <ChevronRight className="h-3 w-3" />
        <span>Privacy Policy</span>
      </nav>

      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck className="h-4.5 w-4.5 text-[hsl(var(--seal))]" />
        <span className="text-xs font-mono font-semibold tracking-widest text-[hsl(var(--verified))] uppercase">Your privacy</span>
      </div>
      <h1 className="font-serif text-3xl md:text-4xl font-semibold mb-1">Privacy Policy</h1>
      <p className="text-xs text-muted-foreground mb-10">Last updated: September 2026</p>

      <div className="max-w-2xl prose prose-sm dark:prose-invert space-y-8 text-sm text-muted-foreground leading-relaxed">
        <section>
          <h2 className="text-base font-bold text-foreground mb-2">1. Who we are</h2>
          <p>
            BetMeter provides booking-code tools — decoding, converting, splitting, odds
            comparison, a code vault, and a stake calculator — through this website and a
            Telegram bot. This policy explains what we collect and why.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-foreground mb-2">2. Information we collect</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Booking codes and decoded slips:</strong> when you paste a code, it&rsquo;s
              resolved into its games and markets and stored so we don&rsquo;t need to re-decode
              it every time you revisit it (e.g. in your Vault).
            </li>
            <li>
              <strong>Vault entries:</strong> codes you explicitly save, their status, and
              settlement history.
            </li>
            <li>
              <strong>Account settings:</strong> if you use the Telegram bot, your Telegram chat
              ID (to send you notifications) and any bankroll figure you enter for the stake
              calculator.
            </li>
            <li>
              <strong>Usage data:</strong> standard, aggregated analytics (pages visited,
              approximate location at country/city level) to understand how the tools are used.
            </li>
          </ul>
          <p className="mt-2">
            We don&rsquo;t sell your data. Vault and settings data is stored only to make the
            tools work across sessions and can be deleted on request.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-foreground mb-2">3. Cookies</h2>
          <p>
            We use cookies for site preferences (like remembering that you&rsquo;ve dismissed the
            cookie notice) and aggregated analytics. BetMeter does not run display advertising —
            there is no ad-network cookie on this site. You can control or disable cookies
            through your browser settings.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-foreground mb-2">4. How we make money</h2>
          <p>
            BetMeter is funded through affiliate arrangements with betting platforms — a
            &ldquo;Open in [Platform]&rdquo; link may be an affiliate link. This doesn&rsquo;t
            change the price or odds you see on that platform, and it doesn&rsquo;t influence a
            selection&rsquo;s confidence score.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-foreground mb-2">5. Third-party links</h2>
          <p>
            Tool pages link out to betting platforms and, for the Predictor and Confidence
            Engine, third-party sports-data providers. Once you leave BetMeter we have no control
            over those sites&rsquo; privacy practices.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-foreground mb-2">6. Age requirement</h2>
          <p>
            BetMeter is not directed at anyone under the legal gambling age in their
            jurisdiction, and we do not knowingly collect personal information from minors. If
            you believe a minor has used the service, contact us and we&rsquo;ll act on it.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-foreground mb-2">7. Your rights</h2>
          <p>
            You can request access to, correction of, or deletion of any personal data we hold —
            including your Vault history and Telegram linkage — by contacting us below.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-foreground mb-2">8. Changes to this policy</h2>
          <p>
            We&rsquo;ll update the &ldquo;Last updated&rdquo; date above whenever this policy
            changes materially.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-foreground mb-2">9. Contact us</h2>
          <ul className="list-none pl-0 space-y-1">
            <li>
              📧 Email:{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[hsl(var(--verified))] underline">
                {SUPPORT_EMAIL}
              </a>
            </li>
            <li>
              🌐 Web:{' '}
              <Link href="/contact" className="text-[hsl(var(--verified))] underline">
                betmeter.com/contact
              </Link>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
