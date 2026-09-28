import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, MessageCircle, Phone, Mail, Clock } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Contact Us — Naira Autos Customer Support',
  description: 'Have issues with our import duty calculator, VIN checker, or auto loan tool? Get in touch with Naira Autos support via WhatsApp, Call, or Email.',
  alternates: {
    canonical: 'https://www.naira.autos/contact',
  },
  openGraph: {
    title: 'Contact Naira Autos Support',
    description: 'We are here to assist you. Connect directly via WhatsApp or reach our support email box.',
    url: 'https://www.naira.autos/contact',
    type: 'website',
  },
};

export default function ContactPage() {
  return (
    <>
      {/* Hero Section */}
      <div className="bg-[#080C10] border-b border-white/10">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 pt-10 pb-12">
          <nav className="flex items-center gap-1.5 text-xs text-white/30 mb-8" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-white/60 transition-colors">Home</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-white/50">Contact</span>
          </nav>

          <div className="max-w-3xl">
            <h1
              className="font-black uppercase text-white leading-none tracking-tight mb-2"
              style={{ fontFamily: "'Barlow Condensed', Impact, sans-serif", fontSize: 'clamp(32px, 5vw, 60px)' }}
            >
              Get In Touch
            </h1>
            <p className="text-white/80 text-sm leading-relaxed">
              Encountered a bug? Want to suggest an automotive tool? Or looking to partner with us? Our communication channels are always open.
            </p>
          </div>
        </div>
      </div>

      {/* Main Section Layout */}
      <div className="bg-background">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-14">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* WhatsApp */}
            <a
              href="https://wa.me/2349032047288"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-4 p-5 bg-green-500/5 border border-green-500/20 rounded-2xl hover:bg-green-500/10 transition-colors group"
            >
              <div className="p-3 bg-green-500/10 rounded-xl group-hover:bg-green-500/20 transition-colors">
                <MessageCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="font-bold text-foreground text-base">WhatsApp Support</p>
                <p className="text-xs text-muted-foreground mt-1 mb-3">Fastest response times for tool inquiries and feedback.</p>
                <span className="text-xs font-semibold text-green-600 dark:text-green-400">Chat Now &rarr;</span>
              </div>
            </a>

            {/* Phone Call */}
            <a
              href="tel:09032047288"
              className="flex items-start gap-4 p-5 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl hover:bg-emerald-500/10 transition-colors group"
            >
              <div className="p-3 bg-emerald-500/10 rounded-xl group-hover:bg-emerald-500/20 transition-colors">
                <Phone className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="font-bold text-foreground text-base">Call Support</p>
                <p className="text-xs text-muted-foreground mt-1 mb-3">Speak to an agent regarding complex system queries.</p>
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">09032047288</span>
              </div>
            </a>

            {/* Email */}
            <a
              href="mailto:help.nairaautos@gmail.com"
              className="flex items-start gap-4 p-5 bg-muted/50 border border-border rounded-2xl hover:bg-muted transition-colors group"
            >
              <div className="p-3 bg-muted border border-border rounded-xl group-hover:bg-border transition-colors">
                <Mail className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="font-bold text-foreground text-base">Email Desk</p>
                <p className="text-xs text-muted-foreground mt-1 mb-3">For advertisements, formal suggestions, and partnership pitches.</p>
                <span className="text-xs font-semibold text-foreground/80 break-all">help.nairaautos@gmail.com</span>
              </div>
            </a>

          </div>

          {/* Operational Hours Note */}
          <div className="mt-12 flex items-center gap-3 p-4 border border-border bg-card/40 rounded-xl max-w-xl">
            <Clock className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            <p className="text-xs text-muted-foreground leading-normal">
              <strong>Support Hours:</strong> Monday through Saturday, 8:00 AM – 6:00 PM (WAT). Technical bug reports via email are tracked 24/7.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}