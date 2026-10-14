'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Loader2, Plus, RefreshCw, LogOut, CheckCircle2, XCircle, Clock, HelpCircle, Send } from 'lucide-react';

const PLATFORMS = [{ slug: 'sportybet', label: 'SportyBet' }, { slug: 'bet9ja', label: 'Bet9ja' }];
const POLL_INTERVAL_MS = 2000;

interface VaultEntry {
  id: string;
  code: string;
  status: 'pending' | 'won' | 'lost' | 'void' | 'unable_to_check';
  legs_total: number;
  legs_correct: number | null;
  saved_at: string;
  platforms: { slug: string; name: string } | null;
}

interface VaultUser {
  username: string | null;
  firstName: string | null;
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

function ConnectTelegram({ onConnected }: { onConnected: () => void }) {
  const [starting, setStarting] = useState(false);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;

  async function handleStart() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch('/api/vault/auth/start', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.deepLink) {
        setError(data.error ?? 'Could not start sign-in. Try again.');
        return;
      }
      setDeepLink(data.deepLink);
      setToken(data.token);
    } catch {
      setError('Could not start sign-in. Try again.');
    } finally {
      setStarting(false);
    }
  }

  // Wait for the bot to confirm; the status route sets the session cookie.
  useEffect(() => {
    if (!token) return;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/vault/auth/status?token=${token}`, { cache: 'no-store' });
        const data = await res.json();
        if (stopped) return;
        if (data.status === 'ok') {
          stopped = true;
          clearInterval(timer);
          onConnectedRef.current();
        } else if (data.status === 'expired') {
          stopped = true;
          clearInterval(timer);
          setToken(null);
          setDeepLink(null);
          setError('That sign-in link expired. Tap Connect to try again.');
        }
      } catch {
        // transient network error -- keep polling
      }
    }, POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [token]);

  return (
    <div className="rounded-sm border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-1">
        <Send className="h-4 w-4 text-[hsl(var(--seal))]" />
        <p className="text-sm font-medium">Connect Telegram to use the Vault</p>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        No email or password. Connect your Telegram and we&rsquo;ll message you there when a saved code settles.
      </p>

      {deepLink ? (
        <div className="space-y-3">
          <a
            href={deepLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-sm bg-[hsl(var(--ink))] px-4 text-sm font-semibold text-[hsl(var(--paper))]"
          >
            <Send className="h-4 w-4" /> Open Telegram
          </a>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Tap <span className="font-semibold">Start</span> in the bot, then come back here&hellip;
          </p>
        </div>
      ) : (
        <button
          onClick={handleStart}
          disabled={starting}
          className="inline-flex h-10 items-center gap-2 rounded-sm bg-[hsl(var(--ink))] px-4 text-sm font-semibold text-[hsl(var(--paper))] disabled:opacity-50"
        >
          {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Connect with Telegram
        </button>
      )}

      {error && <p className="mt-3 text-xs text-[hsl(var(--rust))]">{error}</p>}
    </div>
  );
}

export function VaultManager() {
  const [user, setUser] = useState<VaultUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);

  const [platform, setPlatform] = useState(PLATFORMS[0].slug);
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const loadMe = useCallback(async () => {
    try {
      const res = await fetch('/api/vault/me', { cache: 'no-store' });
      const data = await res.json();
      setUser(data.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setCheckingAuth(false);
    }
  }, []);

  const loadEntries = useCallback(async () => {
    setLoadingEntries(true);
    try {
      const res = await fetch('/api/vault/entries', { cache: 'no-store' });
      if (res.status === 401) {
        setUser(null);
        return;
      }
      const data = await res.json();
      setEntries(data.entries ?? []);
    } finally {
      setLoadingEntries(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  useEffect(() => {
    if (user) loadEntries();
  }, [user, loadEntries]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;

    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/vault/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, code: code.trim() }),
      });
      const data = await res.json();
      if (res.status === 401) {
        setUser(null);
        return;
      }
      if (!res.ok) {
        setSaveError(data.error ?? "Couldn't save that entry.");
        return;
      }
      setCode('');
      loadEntries();
    } catch {
      setSaveError('Something went wrong. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCheck(entryId: string) {
    setCheckingId(entryId);
    try {
      await fetch('/api/vault/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId }),
      });
      await loadEntries();
    } finally {
      setCheckingId(null);
    }
  }

  async function handleSignOut() {
    await fetch('/api/vault/auth/logout', { method: 'POST' });
    setUser(null);
    setEntries([]);
  }

  if (checkingAuth) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <ConnectTelegram onConnected={loadMe} />;
  }

  const displayName = user.username ? `@${user.username}` : user.firstName ?? 'Telegram user';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-xs text-muted-foreground truncate">Connected as {displayName}</p>
        <button
          onClick={handleSignOut}
          className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-[hsl(var(--rust))]"
        >
          <LogOut className="h-3.5 w-3.5" /> Disconnect
        </button>
      </div>

      <div className="rounded-sm border border-border bg-muted/40 p-4 flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-[hsl(var(--verified))]" />
        <p className="text-sm">Telegram alerts are on. Saved codes are checked hourly.</p>
      </div>

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
