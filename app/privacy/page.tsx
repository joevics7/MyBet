import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, ShieldCheck } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Privacy Policy | Naira Autos',
  description: 'Learn how Naira Autos collects, uses, and protects your information when you use our tools, calculators, and blog.',
  alternates: {
    canonical: 'https://www.naira.autos/privacy',
  },
  openGraph: {
    title: 'Privacy Policy | Naira Autos',
    description: 'Learn how Naira Autos collects, uses, and protects your information.',
    url: 'https://www.naira.autos/privacy',
    type: 'website',
  },
};

export default function PrivacyPage() {
  return (
    <>
      <div className="bg-[#080C10] border-b border-white/10">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 pt-10 pb-12">
          <nav className="flex items-center gap-1.5 text-xs text-white/30 mb-8" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-white/60 transition-colors">Home</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-white/50">Privacy Policy</span>
          </nav>

          <div className="flex items-center gap-3 mb-3">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            <span className="text-xs font-bold tracking-widest text-emerald-400 uppercase">Your Privacy</span>
          </div>

          <h1
            className="font-black uppercase text-white leading-none tracking-tight mb-2"
            style={{ fontFamily: "'Barlow Condensed', Impact, sans-serif", fontSize: 'clamp(32px, 5vw, 60px)' }}
          >
            Privacy Policy
          </h1>
          <p className="text-white/60 text-xs">Last Updated: June 2026</p>
        </div>
      </div>

      <div className="bg-background">
        <div className="max-w-screen-md mx-auto px-4 py-14">
          <div className="prose dark:prose-invert space-y-8 text-sm text-muted-foreground leading-relaxed">

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">1. Who We Are</h2>
              <p>
                Naira Autos (<strong>www.naira.autos</strong>) is a Nigerian automotive information platform that provides free tools, price guides, a car glossary, and editorial content to help Nigerians make better decisions when buying, selling, or maintaining a vehicle. This Privacy Policy explains what information we collect, how we use it, and your rights regarding that information.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">2. Information We Collect</h2>
              <p>We collect two types of information:</p>
              <ul className="list-disc pl-5 space-y-2 mt-2">
                <li>
                  <strong>Information you give us directly:</strong> If you contact us via email, WhatsApp, or our contact form, we receive your name, contact details, and the content of your message. We use this only to respond to your enquiry.
                </li>
                <li>
                  <strong>Information collected automatically:</strong> When you visit our site, standard analytics tools (such as Google Analytics) automatically collect non-personal data including your browser type, device type, approximate location (country/city level), pages visited, and how long you spent on each page. This helps us understand how the site is being used so we can improve it.
                </li>
              </ul>
              <p className="mt-2">
                Inputs you enter into our tools — such as car models, loan amounts, or VIN numbers — are processed locally to generate your result. This data is not stored on our servers, sold, or shared with any third party.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">3. Cookies</h2>
              <p>
                Our site uses cookies — small text files stored on your device — for the following purposes:
              </p>
              <ul className="list-disc pl-5 space-y-2 mt-2">
                <li><strong>Analytics cookies</strong> (e.g. Google Analytics): Help us understand traffic patterns and improve site performance. Data is aggregated and anonymous.</li>
                <li><strong>Advertising cookies</strong> (e.g. Google AdSense): We display advertisements served by Google AdSense. Google uses cookies, including the DoubleClick cookie, to serve ads based on your prior visits to this site and other sites on the web. You can opt out of personalised advertising by visiting <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer" className="text-emerald-500 underline">Google&apos;s Ad Settings</a> or <a href="https://www.aboutads.info" target="_blank" rel="noopener noreferrer" className="text-emerald-500 underline">aboutads.info</a>.</li>
                <li><strong>Preference cookies</strong>: Remember small choices you make on the site, such as dismissing the cookie notice.</li>
              </ul>
              <p className="mt-2">
                You can control or disable cookies at any time through your browser settings. Note that disabling certain cookies may affect how the site functions.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">4. Advertising</h2>
              <p>
                Naira Autos displays advertisements through <strong>Google AdSense</strong>. As a third-party vendor, Google uses cookies to serve ads based on a user&apos;s past browsing behaviour. These are standard industry practices. Google&apos;s use of advertising cookies is governed by <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-emerald-500 underline">Google&apos;s Privacy Policy</a>.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">5. Third-Party Links</h2>
              <p>
                Some of our blog articles and tool pages may contain links to external websites. Once you leave Naira Autos, we have no control over those sites or their privacy practices. We encourage you to read the privacy policy of any external site you visit.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">6. Children&apos;s Privacy</h2>
              <p>
                Naira Autos is not directed at children under the age of 13, and we do not knowingly collect personal information from children.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">7. Your Rights</h2>
              <p>
                You have the right to request access to any personal information we hold about you, ask for its correction or deletion, or withdraw consent for any processing based on consent. To make any such request, contact us at the details below.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">8. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. When we do, we will revise the &quot;Last Updated&quot; date at the top of this page. We encourage you to check back periodically.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">9. Contact Us</h2>
              <p>
                If you have any questions about this Privacy Policy, please reach out:
              </p>
              <ul className="list-none pl-0 space-y-1 mt-2">
                <li>📧 Email: <a href="mailto:hello@naira.autos" className="text-emerald-500 underline">hello@naira.autos</a></li>
                <li>🌐 Web: <Link href="/contact" className="text-emerald-500 underline">www.naira.autos/contact</Link></li>
              </ul>
            </section>

          </div>
        </div>
      </div>
    </>
  );
      }
                
