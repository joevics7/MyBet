'use client';

import { motion } from 'framer-motion';
import { Clock3, BookOpen, Radio } from 'lucide-react';

const cardMotion = (delay: number) => ({
  initial: { opacity: 0, y: 24 as number },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, delay, ease: [0.2, 0.9, 0.3, 1] as [number, number, number, number] },
});

export function HeroCardStack() {
  return (
    <div className="relative h-[380px] sm:h-[420px]">
      {/* Guide card — back layer */}
      <motion.div
        {...cardMotion(0.05)}
        style={{ rotate: -7 }}
        whileHover={{ rotate: -4, y: -4 }}
        className="absolute left-1/2 top-3 w-[240px] sm:w-[260px] -translate-x-[78%] rounded-sm border border-border bg-card shadow-md p-4"
      >
        <BookOpen className="h-4 w-4 text-[hsl(var(--verified))]" strokeWidth={2} />
        <p className="mt-2.5 text-xs font-mono text-muted-foreground uppercase tracking-wide">Guide</p>
        <p className="mt-1 font-serif text-sm font-semibold leading-snug">
          How to Write a Scholarship Essay That Gets Read
        </p>
        <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
          What separates a memorable essay from the hundreds that sound the same.
        </p>
      </motion.div>

      {/* Scholarship card — middle layer */}
      <motion.div
        {...cardMotion(0.16)}
        style={{ rotate: 6 }}
        whileHover={{ rotate: 3, y: -4 }}
        className="absolute right-1/2 top-8 w-[240px] sm:w-[260px] translate-x-[78%] rounded-sm border border-border bg-card shadow-md p-4"
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wide font-mono text-[hsl(var(--rust))] flex items-center gap-1">
            <Clock3 className="h-3 w-3" /> Closes 6 Oct 2026
          </span>
        </div>
        <p className="mt-2 font-serif text-sm font-semibold leading-snug">
          Chevening Scholarship 2026/27
        </p>
        <p className="mt-2 text-[11px] text-muted-foreground">🇬🇧 UK &middot; Fully funded &middot; Masters</p>
      </motion.div>

      {/* Tracker card — front, centered */}
      <motion.div
        {...cardMotion(0.28)}
        whileHover={{ y: -6 }}
        className="absolute left-1/2 top-1/2 w-[260px] sm:w-[280px] -translate-x-1/2 -translate-y-1/2 rounded-sm border border-[hsl(var(--ink))] bg-[hsl(var(--ink))] shadow-lg overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
          <p className="text-[10px] uppercase tracking-[0.14em] font-medium text-[hsl(var(--paper))]">
            Scholarship Tracker
          </p>
          <span className="flex items-center gap-1 rounded-full border border-[hsl(var(--seal))] px-2 py-0.5 text-[9px] uppercase text-[hsl(var(--seal))]">
            <Radio className="h-2.5 w-2.5" /> Live
          </span>
        </div>
        <div className="px-4 py-3.5">
          <div className="flex items-baseline justify-between py-1.5 border-b border-white/10">
            <span className="text-xs text-[hsl(var(--paper))]/50">Deadline</span>
            <span className="font-mono text-sm text-[hsl(var(--paper))]">6 Oct 2026</span>
          </div>
          <div className="flex items-baseline justify-between py-1.5">
            <span className="text-xs text-[hsl(var(--paper))]/50">Amount</span>
            <span className="font-mono text-sm font-semibold text-[hsl(var(--seal))]">Full tuition</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
