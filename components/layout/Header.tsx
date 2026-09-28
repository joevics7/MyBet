import Link from 'next/link';
import { Search } from 'lucide-react';

export function Header() {
  return (
    <header className="sticky top-0 z-30 bg-[hsl(var(--paper))]/95 backdrop-blur border-b border-border">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="font-serif text-2xl font-semibold tracking-tight text-[hsl(var(--ink))]">
              Edubase
            </span>
            <span className="hidden sm:inline text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--verified))] font-mono">
              verified &amp; sourced
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            <Link href="/quizzes" className="hover:text-[hsl(var(--verified))] transition-colors">
              Quizzes
            </Link>
            <Link href="/scholarships" className="hover:text-[hsl(var(--verified))] transition-colors">
              Scholarships
            </Link>
            <Link href="/blog" className="hover:text-[hsl(var(--verified))] transition-colors">
              Guides
            </Link>
          </nav>

          <Link
            href="/scholarships/browse"
            aria-label="Search Edubase"
            className="flex items-center justify-center h-9 w-9 rounded-full border border-border hover:border-[hsl(var(--verified))] hover:text-[hsl(var(--verified))] transition-colors"
          >
            <Search className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}
