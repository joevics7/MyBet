'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Wrench, Archive, Sparkles } from 'lucide-react';

const TABS = [
  { href: '/', label: 'Home', icon: Home, match: (p: string) => p === '/' },
  { href: '/tools', label: 'Tools', icon: Wrench, match: (p: string) => p.startsWith('/tools') && !p.startsWith('/tools/vault') },
  { href: '/tools/vault', label: 'Vault', icon: Archive, match: (p: string) => p.startsWith('/tools/vault') },
  { href: '/predictor', label: 'Predictor', icon: Sparkles, match: (p: string) => p.startsWith('/predictor') },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed bottom-0 left-0 right-0 w-full max-w-full overflow-hidden z-30 glass border-t border-border safe-area-pb"
    >
      <div className="grid grid-cols-4 w-full">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className="flex min-w-0 flex-col items-center justify-center gap-1 py-2 min-h-[56px]"
            >
              <span
                className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${
                  active ? 'bg-brand/15 shadow-[0_0_18px_-4px_hsl(var(--brand)/0.7)]' : ''
                }`}
              >
                <tab.icon
                  className={`h-5 w-5 ${active ? 'text-brand' : 'text-muted-foreground'}`}
                  strokeWidth={active ? 2.25 : 1.75}
                />
              </span>
              <span
                className={`text-[10px] font-medium ${
                  active ? 'text-brand' : 'text-muted-foreground'
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
