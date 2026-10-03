import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Send, Mail, Clock } from 'lucide-react';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://betmeter.com';
const TELEGRAM_BOT_URL = process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL || 'https://t.me/BetsMeterBot';
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@betmeter.com';

export const metadata: Metadata = {
  title: 'Contact BetMeter',
  description: 'Report a bug, suggest a platform to support, or ask about a tool — reach BetMeter via Telegram or email.',
  alternates: { canonical: `${siteUrl}/contact` },
  openGraph: {
    title: 'Contact BetMeter',
    description: 'Report a bug, suggest a platform to support, or ask about a tool.',
    url: `${siteUrl}/contact`,
    type: 'website',
  },
};

export default function ContactPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-14">
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-8 font-mono" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-[hsl(var(--verified))] transition-colors">Home</Link>
        <ChevronRight className="h-3 w-3" />
        <span>Contact</span>
      </nav>

      <div className="max-w-2xl mb-10">
        <p className="text-xs uppercase tracking-[0.14em] font-mono text-[hsl(var(--verified))] mb-2">Contact</p>
        <h1 className="font-serif text-3xl md:text-4xl font-semibold">Get in touch</h1>
        <p className="mt-3 text-muted-foreground">
          Found a bug in a tool, want a platform added, or have a partnership question? Reach us
          below.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-5 max-w-2xl">
        <a
          href={TELEGRAM_BOT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-start gap-4 p-5 border border-border bg-card rounded-sm hover:border-[hsl(var(--seal))] transition-colors group"
        >
          <div className="p-3 bg-muted rounded-sm">
            <Send className="h-5 w-5 text-[hsl(var(--seal))]" strokeWidth={1.75} />
          </div>
          <div>
            <p className="font-serif font-semibold text-sm">Telegram</p>
            <p className="text-xs text-muted-foreground mt-1 mb-2">
              Fastest way to reach us — message the bot directly.
            </p>
            <span className="text-xs font-semibold text-[hsl(var(--verified))]">Open chat &rarr;</span>
          </div>
        </a>

        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="flex items-start gap-4 p-5 border border-border bg-card rounded-sm hover:border-[hsl(var(--seal))] transition-colors group"
        >
          <div className="p-3 bg-muted rounded-sm">
            <Mail className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
          </div>
          <div>
            <p className="font-serif font-semibold text-sm">Email</p>
            <p className="text-xs text-muted-foreground mt-1 mb-2">
              For partnership pitches and formal suggestions.
            </p>
            <span className="text-xs font-semibold text-foreground/80 break-all">{SUPPORT_EMAIL}</span>
          </div>
        </a>
      </div>

      <div className="mt-10 flex items-center gap-3 p-4 border border-border bg-muted/40 rounded-sm max-w-xl">
        <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <p className="text-xs text-muted-foreground leading-normal">
          Bug reports and platform requests are tracked as they come in — response times vary by volume.
        </p>
      </div>
    </div>
  );
}
