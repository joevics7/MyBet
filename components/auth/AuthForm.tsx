'use client';

import { useState } from 'react';
import { Mail, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

// Magic-link (passwordless) sign-in. No password to store, hash, or leak
// -- simplest secure option for v1. Relies on Supabase's default email
// sending, which has tight rate limits unsuitable for real production
// volume without a custom SMTP provider configured in the Supabase
// dashboard -- fine for now, worth upgrading before this gets real traffic.
export function AuthForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !supabase) return;

    setStatus('sending');
    setErrorMessage(null);

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });

    if (error) {
      setStatus('error');
      setErrorMessage(error.message);
    } else {
      setStatus('sent');
    }
  }

  if (status === 'sent') {
    return (
      <div className="rounded-sm border border-border bg-card p-6 text-center">
        <Mail className="h-6 w-6 text-[hsl(var(--verified))] mx-auto mb-2" />
        <p className="text-sm font-medium">Check your email</p>
        <p className="text-xs text-muted-foreground mt-1">
          We sent a sign-in link to {email}. Click it to open your Vault.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-sm border border-border bg-card p-6">
      <p className="text-sm font-medium mb-1">Sign in to use the Vault</p>
      <p className="text-xs text-muted-foreground mb-4">
        No password needed — we&rsquo;ll email you a one-time sign-in link.
      </p>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="flex-1 h-10 rounded-sm border border-border bg-background px-3 text-sm"
        />
        <button
          type="submit"
          disabled={status === 'sending' || !email.trim()}
          className="h-10 px-4 rounded-sm bg-[hsl(var(--ink))] text-[hsl(var(--paper))] text-sm font-semibold disabled:opacity-50 flex items-center gap-2 flex-shrink-0"
        >
          {status === 'sending' && <Loader2 className="h-4 w-4 animate-spin" />}
          Send link
        </button>
      </form>
      {status === 'error' && (
        <p className="mt-3 text-xs text-[hsl(var(--rust))]">{errorMessage}</p>
      )}
    </div>
  );
}
