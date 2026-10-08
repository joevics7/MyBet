import { NextResponse } from 'next/server';
import { getPlatform } from '@/lib/services/platforms';
import { compareOdds } from '@/lib/services/oddsCompare';

// OddsPapi's per-endpoint cooldowns space out calls, so a long slip takes a while.
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: { platform?: string; code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const slug = body.platform?.trim().toLowerCase();
  const code = body.code?.trim();
  if (!slug || !code) return NextResponse.json({ error: 'platform and code are required' }, { status: 400 });

  const adapter = getPlatform(slug);
  if (!adapter) {
    return NextResponse.json({ status: 'unsupported', message: `"${slug}" isn't supported yet.` });
  }

  const decoded = await adapter.decode(code);
  if (decoded.status !== 'ok') {
    return NextResponse.json({ status: decoded.status, message: "Couldn't read that code. Check it and try again." });
  }

  const comparison = await compareOdds(slug, decoded.selections);
  return NextResponse.json({ status: 'ok', comparison });
}
