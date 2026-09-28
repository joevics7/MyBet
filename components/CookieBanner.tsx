'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

/**
 * Compliant cookie consent banner.
 *
 * Differences from the old version:
 * 1. Real choice — Accept AND Reject, not just "Got it".
 * 2. Sends Google Consent Mode v2 signals (gtag('consent', 'update', ...))
 *    so AdSense/Analytics actually respect the user's choice, instead of
 *    just displaying text with no functional effect.
 * 3. Defaults to "denied" until the user responds — this banner works
 *    together with the default consent state set in layout.tsx (see below),
 *    so tracking is restricted from the very first paint, not just after
 *    this component mounts.
 * 4. Stores the decision with a timestamp so you can expire/re-ask consent
 *    after a set period (e.g. 6-12 months) if you want, without rebuilding
 *    this component later.
 */

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    dataLayer?: any[];
  }
}

const CONSENT_KEY = 'edubase_cookie_consent';
const CONSENT_VERSION = '1'; // bump this if you change cookie/consent practices

type ConsentValue = 'accepted' | 'rejected';

interface StoredConsent {
  value: ConsentValue;
  version: string;
  timestamp: number;
}

function readStoredConsent(): StoredConsent | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredConsent;
    if (parsed.version !== CONSENT_VERSION) return null; // re-ask if policy changed
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredConsent(value: ConsentValue) {
  const payload: StoredConsent = {
    value,
    version: CONSENT_VERSION,
    timestamp: Date.now(),
  };
  localStorage.setItem(CONSENT_KEY, JSON.stringify(payload));
}

function updateGoogleConsent(value: ConsentValue) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;

  if (value === 'accepted') {
    window.gtag('consent', 'update', {
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
      analytics_storage: 'granted',
    });
  } else {
    window.gtag('consent', 'update', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
    });
  }
}

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = readStoredConsent();
    if (stored) {
      // Re-apply their previous choice on every page load, since
      // Consent Mode defaults reset per page unless re-signaled.
      updateGoogleConsent(stored.value);
      setVisible(false);
    } else {
      setVisible(true);
    }
  }, []);

  const handleChoice = (value: ConsentValue) => {
    writeStoredConsent(value);
    updateGoogleConsent(value);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed left-0 right-0 bottom-16 md:bottom-0 safe-area-pb z-40 bg-[hsl(var(--ink))] border-t border-white/10 px-3 py-2 sm:px-4 sm:py-2.5 flex items-center gap-3"
    >
      <p className="text-[11px] sm:text-xs text-[hsl(var(--paper))]/60 flex-1 truncate sm:whitespace-normal">
        We use cookies for analytics and ads.{' '}
        <Link
          href="/privacy"
          className="text-[hsl(var(--verified))] underline underline-offset-2 hover:opacity-80 transition-opacity"
        >
          Learn more
        </Link>
      </p>
      <div className="flex gap-1.5 sm:gap-2 shrink-0">
        <button
          onClick={() => handleChoice('rejected')}
          className="bg-white/10 hover:bg-white/20 transition-colors text-[hsl(var(--paper))] text-xs font-semibold px-3 py-1.5 sm:px-5 sm:py-2 rounded-sm min-h-[36px] sm:min-h-0"
        >
          Reject
        </button>
        <button
          onClick={() => handleChoice('accepted')}
          className="bg-[hsl(var(--seal))] hover:opacity-90 transition-opacity text-[hsl(var(--ink))] text-xs font-semibold px-3 py-1.5 sm:px-5 sm:py-2 rounded-sm min-h-[36px] sm:min-h-0"
        >
          Accept
        </button>
      </div>
    </div>
  );
}
