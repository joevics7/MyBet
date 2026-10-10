// Minimal signed-cookie session for the Telegram-only Vault. The cookie
// holds "<telegramUserId>.<expiresAtMs>.<hmac>" -- no database lookup
// needed to verify it, and it can't be forged without the secret.
// Server-only (uses node:crypto).

import crypto from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';

export const SESSION_COOKIE = 'bm_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function getSecret(): string {
  // SESSION_SECRET is preferred; the service-role key is a fallback so the
  // feature works before a dedicated secret is added (it never leaves the
  // server, and the HMAC doesn't reveal it).
  const secret = process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('SESSION_SECRET (or SUPABASE_SERVICE_ROLE_KEY) is not set.');
  return secret;
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

export function createSessionToken(telegramUserId: string): string {
  const payload = `${telegramUserId}.${Date.now() + SESSION_TTL_MS}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, expires, sig] = parts;
  const expected = sign(`${userId}.${expires}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (!Number.isFinite(Number(expires)) || Number(expires) < Date.now()) return null;
  return userId;
}

// Returns the logged-in telegram_users.id, or null.
export function getSessionUserId(req: NextRequest): string | null {
  try {
    return verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  } catch {
    return null;
  }
}

export function setSessionCookie(res: NextResponse, telegramUserId: string) {
  res.cookies.set(SESSION_COOKIE, createSessionToken(telegramUserId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
}
