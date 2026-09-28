'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Brain, Award, BookOpen } from 'lucide-react';

const TABS = [
  { href: '/', label: 'Home', icon: Home, match: (p: string) => p === '/' },
  { href: '/quizzes', label: 'Quizzes', icon: Brain, match: (p: string) => p.startsWith('/quizzes') },
  { href: '/scholarships', label: 'Scholarships', icon: Award, match: (p: string) => p.startsWith('/scholarships') },
  { href: '/blog', label: 'Guides', icon: BookOpen, match: (p: string) => p.startsWith('/blog') },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[hsl(var(--paper))]/95 backdrop-blur border-t border-border safe-area-pb"
    >
      <div className="grid grid-cols-4">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className="flex flex-col items-center justify-center gap-1 py-2.5 min-h-[56px]"
            >
              <tab.icon
                className={`h-5 w-5 ${active ? 'text-[hsl(var(--verified))]' : 'text-muted-foreground'}`}
                strokeWidth={active ? 2.25 : 1.75}
              />
              <span
                className={`text-[10px] font-medium ${
                  active ? 'text-[hsl(var(--verified))]' : 'text-muted-foreground'
                }`}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
