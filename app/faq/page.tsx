import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, HelpCircle, MessageCircle, Phone, Mail, Wrench, ShieldCheck, FileText } from 'lucide-react';

// ── SEO METADATA ──────────────────────────────────────────────────

export const metadata: Metadata = {
  title: 'Frequently Asked Questions (FAQ) | Naira Autos',
  description: 'Get instant answers about Naira Autos tools — including our free import duty calculator, AI mechanic, VIN checker, and how we help you buy and sell cars safely in Nigeria.',
  alternates: {
    canonical: 'https://www.naira.autos/faq',
  },
  openGraph: {
    title: 'Naira Autos — Frequently Asked Questions',
    description: 'Everything you need to know about utilizing our free automotive calculators, vehicle history verifications, and smart diagnostic tools.',
    url: 'https://www.naira.autos/faq',
    type: 'website',
  },
};

// ── FAQ DATA ──────────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    question: "What is Naira Autos and who built it?",
    answer: "Naira Autos is a complete digital car tools hub founded by Joevics, a passionate car enthusiast and Nigerian car dealer with over 5 years of active market experience. We build free, data-driven software tools to give everyday car buyers, owners, and sellers transparent information.",
    icon: <HelpCircle className="h-5 w-5 text-emerald-400" />
  },
  {
    question: "Are the automotive tools on this site truly free?",
    answer: "Yes, 100% free. There are no premium paywalls, subscription requirements, or hidden registration costs. You can use the Import Duty Calculator, AI Mechanic, and Auto Loan tools as many times as you need without paying a single Kobo.",
    icon: <ShieldCheck className="h-5 w-5 text-emerald-400" />
  },
  {
    question: "How accurate is the Naira Autos Import Duty Calculator?",
    answer: "Our calculators are built using dealer-grade logic mapped directly against active structural pricing sheets and customs schedules used at Nigerian ports. While they provide highly precise market benchmarks to protect you from artificial markups, exact final clearing values should always be cross-checked with a licensed customs broker.",
    icon: <FileText className="h-5 w-5 text-emerald-400" />
  },
  {
    question: "How does the AI Mechanic tool work?",
    answer: "The AI Mechanic tool functions as an automated virtual vehicle diagnostics assistant. By analyzing the symptoms, dashboard warning lights, or abnormal sounds you input, it evaluates common fault points specific to that vehicle model and outputs an immediate breakdown of likely mechanical issues.",
    icon: <Wrench className="h-5 w-5 text-emerald-400" />
  },
  {
    question: "Can I list my vehicle for sale on Naira Autos?",
    answer: "Naira Autos has transitioned from its older models into a pure automotive tools utility hub. However, if you are looking to list a vehicle across open dealer channels or take advantage of premium hands-off selling setups, you can reach out directly to our active dealer desks through our contact routes.",
    icon: <HelpCircle className="h-5 w-5 text-emerald-400" />
  },
  {
    question: "How can I suggest a new tool or report a mathematical bug?",
    answer: "We love feedback! If you find an anomaly in a calculator or want us to build a specific automotive helper, open a ticket via our WhatsApp Support line (09032047288) or drop an email detailing the bug to help.nairaautos@gmail.com.",
    icon: <MessageCircle className="h-5 w-5 text-emerald-400" />
  }
];

// ── PAGE COMPONENT ────────────────────────────────────────────────

export default function FAQPage() {
  
  // Structured Schema for Google Rich Snippets
  const jsonLdSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'mainEntity': FAQ_ITEMS.map(item => ({
      '@type': 'Question',
      'name': item.question,
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': item.answer
      }
    }))
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdSchema) }}
      />

      {/* Hero Header */}
      <div className="bg-[#080C10] border-b border-white/10">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 pt-10 pb-12">
          
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-xs text-white/30 mb-8" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-white/60 transition-colors">Home</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-white/50">FAQ</span>
          </nav>

          <div className="max-w-3xl">
            <span className="text-xs font-bold tracking-widest uppercase text-emerald-400 mb-3 block">
              Have Questions?
            </span>
            <h1
              className="font-black uppercase text-white leading-none tracking-tight mb-4"
              style={{ fontFamily: "'Barlow Condensed', Impact, sans-serif", fontSize: 'clamp(32px, 5vw, 60px)' }}
            >
              Frequently Asked Questions
            </h1>
            <p className="text-white/80 text-sm leading-relaxed">
              Clear, transparent answers about our system logic, data validation, and how tool founder Joevics leverages 5+ years of dealership experience to keep you safe in the automotive market.
            </p>
          </div>
        </div>
      </div>

      {/* Main content split layout */}
      <div className="bg-background">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-14">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            
            {/* Left: Interactive FAQ Cards List */}
            <div className="lg:col-span-2 space-y-4">
              {FAQ_ITEMS.map((faq, idx) => (
                <div 
                  key={idx} 
                  className="bg-card border border-border rounded-2xl p-6 hover:border-emerald-500/30 transition-all group"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-emerald-500/20 transition-colors">
                      {faq.icon}
                    </div>
                    <div className="space-y-2">
                      <h3 className="font-bold text-foreground text-base sm:text-lg leading-snug">
                        {faq.question}
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {faq.answer}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Right: Sidebar Sticky Contact Widget */}
            <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
              <div className="bg-card border border-border rounded-2xl p-6">
                <h2 className="text-sm font-bold text-foreground mb-2 uppercase tracking-wide">
                  Still Need Help?
                </h2>
                <p className="text-xs text-muted-foreground leading-relaxed mb-6">
                  If your questions aren't covered within our tracking matrix, pull up directly to our communication support hubs.
                </p>

                {/* Communication buttons stack */}
                <div className="space-y-3">
                  <a
                    href="https://wa.me/2349032047288"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-xl hover:bg-green-500/20 transition-colors group text-left"
                  >
                    <MessageCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-foreground">WhatsApp Support</p>
                      <p className="text-[11px] text-muted-foreground">Fastest response times</p>
                    </div>
                  </a>

                  <a
                    href="tel:09032047288"
                    className="flex items-center gap-3 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl hover:bg-emerald-500/15 transition-colors text-left"
                  >
                    <Phone className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-foreground">Call Directly</p>
                      <p className="text-[11px] text-muted-foreground">09032047288</p>
                    </div>
                  </a>

                  <a
                    href="mailto:help.nairaautos@gmail.com"
                    className="flex items-center gap-3 p-3 bg-muted border border-border rounded-xl hover:bg-muted/80 transition-colors text-left"
                  >
                    <Mail className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-foreground">Email Support Desk</p>
                      <p className="text-[11px] text-muted-foreground break-all">help.nairaautos@gmail.com</p>
                    </div>
                  </a>
                </div>
              </div>

              {/* Informational Sub-Box */}
              <div className="p-5 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl">
                <h4 className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mb-2">
                  Want to browse terms?
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                  Confused about local car market vocabulary like <em>Tokunbo</em>, <em>Chassis Number</em>, or <em>Customs Paper</em>? Explore our comprehensive glossary database.
                </p>
                <Link 
                  href="/tools/glossary" 
                  className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
                >
                  Open Car Glossary &rarr;
                </Link>
              </div>

            </div>

          </div>
        </div>
      </div>
    </>
  );
}