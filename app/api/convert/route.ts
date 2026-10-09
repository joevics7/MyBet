import { NextResponse } from 'next/server';
import { convertSlip } from '@/lib/converter/convert';

export const maxDuration = 60;

interface Body {
  source?: string;
  target?: string;
  code?: string;
  dropStarted?: boolean;
  minScore?: number | null;
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const source = body.source?.trim().toLowerCase();
  const target = body.target?.trim().toLowerCase();
  const code = body.code?.trim();
  if (!source || !target || !code) {
    return NextResponse.json({ error: 'source, target and code are required' }, { status: 400 });
  }
  const minScore = typeof body.minScore === 'number' && body.minScore >= 20 && body.minScore <= 90 ? Math.round(body.minScore) : null;

  try {
    const result = await convertSlip({ sourceSlug: source, targetSlug: target, code, dropStarted: body.dropStarted !== false, minScore });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[convert]', err);
    return NextResponse.json({ status: 'error', message: 'Something went wrong converting that code. Please try again.' });
  }
}
