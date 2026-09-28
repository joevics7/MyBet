import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Scale } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Terms of Service | Naira Autos',
  description: 'The terms and conditions that govern your use of the Naira Autos website, tools, and content.',
  alternates: {
    canonical: 'https://www.naira.autos/terms',
  },
  openGraph: {
    title: 'Terms of Service | Naira Autos',
    description: 'The terms and conditions that govern your use of the Naira Autos website, tools, and content.',
    url: 'https://www.naira.autos/terms',
    type: 'website',
  },
};

export default function TermsPage() {
  return (
    <>
      <div className="bg-[#080C10] border-b border-white/10">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 pt-10 pb-12">
          <nav className="flex items-center gap-1.5 text-xs text-white/30 mb-8" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-white/60 transition-colors">Home</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-white/50">Terms of Service</span>
          </nav>

          <div className="flex items-center gap-3 mb-3">
            <Scale className="h-5 w-5 text-emerald-400" />
            <span className="text-xs font-bold tracking-widest text-emerald-400 uppercase">Legal</span>
          </div>

          <h1
            className="font-black uppercase text-white leading-none tracking-tight mb-2"
            style={{ fontFamily: "'Barlow Condensed', Impact, sans-serif", fontSize: 'clamp(32px, 5vw, 60px)' }}
          >
            Terms of Service
          </h1>
          <p className="text-white/60 text-xs">Last Updated: June 2026</p>
        </div>
      </div>

      <div className="bg-background">
        <div className="max-w-screen-md mx-auto px-4 py-14">
          <div className="prose dark:prose-invert space-y-8 text-sm text-muted-foreground leading-relaxed">

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">1. Acceptance of Terms</h2>
              <p>
                By accessing or using <strong>www.naira.autos</strong> (&quot;Naira Autos&quot;, &quot;we&quot;, &quot;us&quot;), you agree to be bound by these Terms of Service. If you do not agree, please stop using the site.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">2. What Naira Autos Provides</h2>
              <p>
                Naira Autos is a free information platform for the Nigerian automotive market. We provide:
              </p>
              <ul className="list-disc pl-5 space-y-1 mt-2">
                <li>Free tools including an Import Duty Calculator, Auto Loan Calculator, and AI Mechanic</li>
                <li>Car price guides and spare parts information</li>
                <li>A glossary of Nigerian automotive terms</li>
                <li>Editorial blog content and buying guides</li>
              </ul>
              <p className="mt-3 bg-muted/40 border border-border p-3 rounded-lg text-xs">
                <strong>Important:</strong> All results from our tools and all content on this site are for informational purposes only. Naira Autos is not a licensed customs agent, financial institution, or vehicle inspection service. Always verify figures with the relevant authorities (e.g. Nigeria Customs Service, your bank, or a qualified mechanic) before making any financial decision.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">3. Accuracy of Information</h2>
              <p>
                We make every effort to keep our content accurate and up to date. However, car prices, import duty rates, exchange rates, and spare parts costs change frequently. Naira Autos does not guarantee that any price, figure, or calculation on this site is current or applicable to your specific situation.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">4. Intellectual Property</h2>
              <p>
                All content on this site — including articles, glossary definitions, tool designs, graphics, and the Naira Autos brand — is owned by Naira Autos and is protected by Nigerian and international copyright law. You may not reproduce, republish, or commercially exploit any content from this site without our written permission.
              </p>
              <p className="mt-2">
                Sharing individual articles or linking to our pages for non-commercial purposes is welcome and encouraged.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">5. Prohibited Conduct</h2>
              <p>When using this site, you agree not to:</p>
              <ul className="list-disc pl-5 space-y-1 mt-2">
                <li>Scrape, crawl, or use automated tools to extract content or data from the site</li>
                <li>Attempt to access, overload, or interfere with our servers or API endpoints</li>
                <li>Use our tools or content for any unlawful purpose</li>
                <li>Reproduce our glossary, price data, or editorial content on other websites or platforms without permission</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">6. Third-Party Services and Advertisements</h2>
              <p>
                Naira Autos displays advertisements through Google AdSense. We may also link to third-party websites, marketplaces, or services. We are not responsible for the content, accuracy, or practices of any third-party site. Clicking an advertisement or external link is at your own discretion.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">7. Limitation of Liability</h2>
              <p>
                To the fullest extent permitted by law, Naira Autos and its team members will not be liable for any loss or damage — including financial loss from a bad vehicle purchase, reliance on an inaccurate tool result, or mechanical failure — arising from your use of this site or its content.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">8. Changes to These Terms</h2>
              <p>
                We may update these Terms of Service at any time. Changes take effect as soon as they are posted. Continued use of the site after changes are posted constitutes your acceptance of the revised terms.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">9. Governing Law</h2>
              <p>
                These Terms are governed by the laws of the Federal Republic of Nigeria. Any disputes arising from the use of this site will be subject to the jurisdiction of Nigerian courts.
              </p>
            </section>

            <section>
              <h2 className="text-base font-bold text-foreground mb-2">10. Contact</h2>
              <p>
                For questions about these Terms, please contact us via our <Link href="/contact" className="text-emerald-500 underline">Contact page</Link>.
              </p>
            </section>

          </div>
        </div>
      </div>
    </>
  );
          }
                
