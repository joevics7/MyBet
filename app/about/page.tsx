import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, ShieldCheck, Wrench, FileCheck, ShieldAlert } from 'lucide-react';

export const metadata: Metadata = {
  title: 'About Us — Founded by Joevics | Naira Autos',
  description: 'Built by Joevics, a passionate car enthusiast and Nigerian car dealer with over 5 years of hands-on market experience. Demystifying the car buying process.',
  alternates: {
    canonical: 'https://www.naira.autos/about',
  },
  openGraph: {
    title: 'About Naira Autos — Founded by Joevics',
    description: 'How a trusted car dealer with over 5 years of experience built a suite of free tools to protect Nigerian car buyers from getting ripped off.',
    url: 'https://www.naira.autos/about',
    type: 'website',
  },
};

export default function AboutPage() {
  return (
    <>
      {/* Hero Section */}
      <div className="bg-[#080C10] border-b border-white/10">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 pt-10 pb-12">
          <nav className="flex items-center gap-1.5 text-xs text-white/30 mb-8" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-white/60 transition-colors">Home</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-white/50">About</span>
          </nav>

          <div className="max-w-3xl">
            <h1
              className="font-black uppercase text-white leading-none tracking-tight mb-4"
              style={{ fontFamily: "'Barlow Condensed', Impact, sans-serif", fontSize: 'clamp(32px, 5vw, 60px)' }}
            >
              The Story Behind Naira Autos
            </h1>
            <p className="text-white/80 text-sm sm:text-base leading-relaxed">
              Naira Autos was founded by <strong>Joevics</strong>, a lifelong car enthusiast and active car dealer with over 5 years of hands-on experience in the Nigerian automotive market. We build real tools to solve the real problems buyers and owners face every single day.
            </p>
          </div>
        </div>
      </div>

      {/* Main Content Body */}
      <div className="bg-background">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-14">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
            
            {/* Biography & Mission Statement */}
            <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
              <h2 className="text-xl font-black uppercase text-foreground mb-2" style={{ fontFamily: "'Barlow Condensed', Impact, sans-serif" }}>
                Meet Joevics
              </h2>
              <p>
                After spending half a decade sourcing, inspecting, clearing, and selling vehicles across Nigeria, Joevics saw a massive structural problem: <strong>the deep lack of transparent data for the everyday buyer.</strong> 
              </p>
              <p>
                In the local market, bad actors frequently take advantage of buyers who don't understand custom clearing rates, how to verify hidden mechanical faults, or how to spot altered mileage on incoming <em>Tokunbo</em> cars. 
              </p>
              <p>
                "As a dealer, I’ve seen buyers lose millions of Naira simply because they didn't have access to basic, accurate diagnostic tools before making a bank transfer," says Joevics. "Naira Autos was built to completely eliminate that information asymmetry."
              </p>
              <p>
                By combining years of practical dealership knowledge with digital automation, this platform offers a suite of completely free tools—such as our custom Import Duty Calculator, AI Mechanic diagnostic assistant, and accurate VIN verification tools.
              </p>
            </div>

            {/* Feature Highlights Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-5 border border-border bg-card rounded-2xl">
                <Wrench className="h-6 w-6 text-emerald-500 mb-3" />
                <h3 className="font-bold text-sm text-foreground mb-1">Dealer-Grade Logic</h3>
                <p className="text-xs text-muted-foreground">Our computational calculators are built using parameters vetted from real, live dealership workflows.</p>
              </div>
              <div className="p-5 border border-border bg-card rounded-2xl">
                <FileCheck className="h-6 w-6 text-emerald-500 mb-3" />
                <h3 className="font-bold text-sm text-foreground mb-1">Port Clearing Insights</h3>
                <p className="text-xs text-muted-foreground">Up-to-date duty cost mappings that reflect reality at Nigerian ports, avoiding artificial markups.</p>
              </div>
              <div className="p-5 border border-border bg-card rounded-2xl">
                <ShieldCheck className="h-6 w-6 text-emerald-500 mb-3" />
                <h3 className="font-bold text-sm text-foreground mb-1">Buyer Protection First</h3>
                <p className="text-xs text-muted-foreground">We give users the exact checklists and validation metrics needed to negotiate fairly with any dealer.</p>
              </div>
              <div className="p-5 border border-border bg-card rounded-2xl">
                <ShieldAlert className="h-6 w-6 text-emerald-500 mb-3" />
                <h3 className="font-bold text-sm text-foreground mb-1">100% Free Resources</h3>
                <p className="text-xs text-muted-foreground">No hidden charges or paywalls. Every tool we build is accessible to empower Nigerian car consumers.</p>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}