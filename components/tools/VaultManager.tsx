'use client';

import { useEffect, useState, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Loader2, Plus, RefreshCw, LogOut, CheckCircle2, XCircle, Clock, HelpCircle, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { AuthForm } from '@/components/auth/AuthForm';

const PLATFORMS = [{ slug: 'sportybet', label: 'SportyBet' }, { slug: 'bet9ja', label: 'Bet9ja' }];

interface VaultEntry {
  id: string;
  code: string;
  status: 'pending' | 'won' | 'lost' | 'void' | 'unable_to_check';
  legs_total: number;
  legs_correct: number | null;
  saved_at: string;
  platforms: { slug: string; name: string } | null;
}

function StatusBadge({ status }: { status: VaultEntry['status'] }) {
  const map: Record<VaultEntry['status'], { icon: typeof CheckCircle2; className: string; label: string }> = {
    won: { icon: CheckCircle2, className: 'text-[hsl(var(--verified))]', label: 'Won' },
    lost: { icon: XCircle, className: 'text-[hsl(var(--rust))]', label: 'Lost' },
    void: { icon: HelpCircle, className: 'text-muted-foreground', label: 'Void' },
    unable_to_check: { icon: HelpCircle, className: 'text-muted-foreground', label: 'Can\u2019t auto-check' },
    pending: { icon: Clock, className: 'text-amber-600', label: 'Pending' },
  };
  const { icon: Icon, className, label } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${className}`}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </span>
  );
}

export function VaultManager() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);

  const [platform, setPlatform] = useState(PLATFORMS[0].slug);
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const [telegramLinked, setTelegramLinked] = useState<boolean | null>(null); // null = not checked yet
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setCheckingAuth(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCheckingAuth(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const loadEntries = useCallback(async () => {
    if (!supabase || !session) return;
    setLoadingEntries(true);
    const { data } = await supabase
      .from('vault_entries')
      .select('id, code, status, legs_total, legs_correct, saved_at, platforms(slug, name)')
      .order('saved_at', { ascending: false });
    setEntries((data as unknown as VaultEntry[]) ?? []);
    setLoadingEntries(false);
  }, [session]);

  const checkTelegramLinked = useCallback(async () => {
    if (!supabase || !session) return;
    const { data } = await supabase
      .from('user_settings')
      .select('telegram_chat_id')
      .eq('user_id', session.user.id)
      .maybeSingle();
    setTelegramLinked(!!data?.telegram_chat_id);
  }, [session]);

  useEffect(() => {
    if (session) {
      loadEntries();
      checkTelegramLinked();
    }
  }, [session, loadEntries, checkTelegramLinked]);

  async function handleGenerateLinkCode() {
    if (!session) return;
    setGeneratingLink(true);
    try {
      const res = await fetch('/api/telegram/link', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (data.code) setLinkCode(data.code);
    } finally {
      setGeneratingLink(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !supabase || !session) return;

    setSaving(true);
    setSaveError(null);

    try {
      const decodeRes = await fetch('/api/decode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, code: code.trim() }),
      });
      const decoded = await decodeRes.json();

      if (decoded.status !== 'ok') {
        setSaveError("Couldn't decode that code — check it's correct.");
        return;
      }

      const { error } = await supabase.from('vault_entries').insert({
        user_id: session.user.id,
        platform_id: decoded.platformId,
        code: code.trim(),
        decode_id: decoded.decodeId,
        legs_total: decoded.selections.length,
        status: 'pending',
      });

      if (error) {
        // Unique constraint (user_id, platform_id, code) -- already saved.
        setSaveError(
          error.code === '23505' ? "You've already saved this code." : "Couldn't save that entry.",
        );
      } else {
        setCode('');
        loadEntries();
      }
    } catch {
      setSaveError('Something went wrong. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCheck(entryId: string) {
    if (!session) return;
    setCheckingId(entryId);
    try {
      await fetch('/api/vault/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ entryId }),
      });
      await loadEntries();
    } finally {
      setCheckingId(null);
    }
  }

  async function handleSignOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  if (checkingAuth) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!supabase) {
    return (
      <div className="rounded-sm border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">
        The Vault needs Supabase configured to work.
      </div>
    );
  }

  if (!session) {
    return <AuthForm />;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground truncate">{session.user.email}</p>
        <button
          onClick={handleSignOut}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-[hsl(var(--rust))]"
        >
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>

      {telegramLinked === false && (
        <div className="rounded-sm border border-border bg-muted/40 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Send className="h-4 w-4 text-[hsl(var(--seal))]" />
            <p className="text-sm font-medium">Get notified on Telegram when a code settles</p>
          </div>
          {linkCode ? (
            <div className="mt-2">
              <p className="text-xs text-muted-foreground">
                Message{' '}
                <a
                  href={process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL || 'https://t.me/BetsMeterBot'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[hsl(var(--verified))] underline"
                >
                  our Telegram bot
                </a>{' '}
                with:
              </p>
              <p className="mt-1 font-mono text-sm bg-background border border-border rounded-sm px-3 py-1.5 inline-block">
                /link {linkCode}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">Expires in 10 minutes.</p>
            </div>
          ) : (
            <button
              onClick={handleGenerateLinkCode}
              disabled={generatingLink}
              className="mt-2 text-xs font-semibold text-[hsl(var(--verified))] disabled:opacity-50"
            >
              {generatingLink ? 'Generating...' : 'Get a link code'}
            </button>
          )}
        </div>
      )}
      {telegramLinked === true && (
        <div className="rounded-sm border border-border bg-muted/40 p-4 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-[hsl(var(--verified))]" />
          <p className="text-sm">Telegram notifications are on for this account.</p>
        </div>
      )}

      <form onSubmit={handleSave} className="rounded-sm border border-border bg-card p-5 space-y-3">
        <p className="text-xs font-mono uppercase tracking-wide text-muted-foreground">Save a code</p>
        <div className="flex gap-2">
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="h-10 min-w-0 max-w-[38%] rounded-sm border border-border bg-background px-2 text-sm"
          >
            {PLATFORMS.map((p) => (
              <option key={p.slug} value={p.slug}>{p.label}</option>
            ))}
          </select>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Booking code"
            className="flex-1 min-w-0 h-10 rounded-sm border border-border bg-background px-3 text-sm font-mono uppercase"
          />
          <button
            type="submit"
            disabled={saving || !code.trim()}
            className="h-10 px-4 rounded-sm bg-[hsl(var(--ink))] text-[hsl(var(--paper))] text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Save
          </button>
        </div>
        {saveError && <p className="text-xs text-[hsl(var(--rust))]">{saveError}</p>}
      </form>

      <div className="space-y-2">
        {loadingEntries && entries.length === 0 ? (
          <div className="flex justify-center py-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No saved codes yet.</p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between gap-3 rounded-sm border border-border px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-mono truncate">
                  {entry.code} <span className="text-muted-foreground font-sans">— {entry.platforms?.name ?? 'Unknown'}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {entry.legs_total} selections
                  {entry.legs_correct !== null && ` \u00b7 ${entry.legs_correct} correct`}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <StatusBadge status={entry.status} />
                {entry.status === 'pending' && (
                  <button
                    onClick={() => handleCheck(entry.id)}
                    disabled={checkingId === entry.id}
                    className="h-8 w-8 flex items-center justify-center rounded-sm border border-border hover:border-[hsl(var(--seal))] disabled:opacity-50"
                    aria-label="Check now"
                  >
                    {checkingId === entry.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
