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
