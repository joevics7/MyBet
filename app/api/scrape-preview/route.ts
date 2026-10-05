import { NextRequest, NextResponse } from 'next/server';
import { fetchViaZenRows } from '@/lib/services/zenrows';

export const runtime = 'nodejs';
export const maxDuration = 30;

// TEMPORARY diagnostic route -- not a product feature. Lets us see what
// ZenRows actually returns for a blocked site (predictz.com, forebet.com)
// before writing a real parser for it, same staged approach used for
// every other site so far (capture first, build parser second). Remove
// once predictz.ts / forebet.ts exist and this has served its purpose.
//
// Gated with CRON_SECRET (reused, not a new secret for a throwaway
// route) -- without this, it's a free open proxy for anyone who finds
// the URL, burning our paid ZenRows credits on arbitrary sites.
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const targetUrl = req.nextUrl.searchParams.get('url');
  if (!targetUrl) {
    return NextResponse.json({ error: 'url query param is required' }, { status: 400 });
  }

  const html = await fetchViaZenRows(targetUrl, { jsRender: true, premiumProxy: true });
  if (!html) {
    return NextResponse.json({ error: 'ZenRows fetch failed -- check Vercel logs for the actual error' }, { status: 502 });
  }

  const text = stripHtml(html);

  return NextResponse.json({
    rawHtmlLength: html.length,
    cleanedTextPreview: text.slice(0, 5000),
    cleanedTextTotalLength: text.length,
  });
}
