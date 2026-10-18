// Shared Gemini "cleaner" for the tipster scrapers (PredictZ, Vitibet, SoccerTips).
//
// What it does: takes already-fetched page text (or pre-split rows) and asks Gemini to return ONE
// clean record per match: team names + the site's predicted score. Nothing here fetches a site.
//
// Why it is safe to trust: Gemini is only a parser, never a predictor. Every record it returns is
// checked against the source text before it is used:
//   - both team names must appear in the source text (so it cannot invent or "fix" names)
//   - scores must be whole numbers 0-15
//   - an optional per-site check (e.g. the score must be one of the scores actually on the page)
// Records that fail are dropped and counted, never silently kept.
//
// Cost note: the model has a very large context window, so a whole day's page fits in one request.
// Large row lists are split into chunks that run in parallel, to keep each call (and its output) short.

// Same model the rest of the app uses; set GEMINI_EXTRACT_MODEL on Vercel to try a lighter/faster one for these parsing jobs.
const GEMINI_MODEL = process.env.GEMINI_EXTRACT_MODEL || 'gemini-3.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export interface AiMatchRow {
  id: string | null; // echoes the id given on the input line (Vitibet fixture id, SoccerTips row index); null for page-level extraction
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
}

export interface AiExtractResult {
  rows: AiMatchRow[]; // validated rows only
  returned: number; // how many records Gemini sent back
  rejected: number; // how many of those failed validation
  error: string | null; // set when the call itself failed (no key, HTTP error, bad JSON, timeout)
}

// Shared pacing for every Gemini call in this process (all sources, page and cron): the first 3 calls of a
// burst start immediately, each further call waits its turn, starting 2s after the previous one. Gemini
// answers 503 "high demand" less often when it is not hit with everything at once. A burst ends after 10s
// of quiet. The slot is reserved synchronously, so concurrent callers cannot race into the same slot.
const IMMEDIATE_CALLS = 3;
const SPACING_MS = 2000;
const BURST_RESET_MS = 10000;
let burstCount = 0;
let lastStartAt = 0;
let nextSlotAt = 0;

async function acquireGeminiSlot(): Promise<void> {
  const now = Date.now();
  if (now - lastStartAt > BURST_RESET_MS) {
    burstCount = 0;
    nextSlotAt = 0;
  }
  burstCount++;
  if (burstCount <= IMMEDIATE_CALLS) {
    lastStartAt = now;
    nextSlotAt = now + SPACING_MS;
    return;
  }
  const start = Math.max(now, nextSlotAt);
  nextSlotAt = start + SPACING_MS;
  lastStartAt = start;
  if (start > now) await new Promise((r) => setTimeout(r, start - now));
}

export function normalizeForCheck(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

interface ExtractOptions {
  source: string; // for log messages only
  instructions: string; // site-specific description of the input format
  input: string; // the text sent to Gemini
  // What names are validated against: one text for the whole input, or a map id -> text for line-based input.
  checkSource: string | Map<string, string>;
  allowedIds?: Set<string>; // if given, returned ids must be in this set
  scoreCheck?: (homeScore: number, awayScore: number) => boolean; // optional extra per-site validation
  maxOutputTokens?: number;
  timeoutMs?: number;
}

const RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      id: { type: 'STRING' },
      home_team: { type: 'STRING' },
      away_team: { type: 'STRING' },
      home_score: { type: 'INTEGER' },
      away_score: { type: 'INTEGER' },
    },
    required: ['home_team', 'away_team', 'home_score', 'away_score'],
  },
};

export async function geminiExtractMatches(opts: ExtractOptions): Promise<AiExtractResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { rows: [], returned: 0, rejected: 0, error: 'GEMINI_API_KEY is not set' };

  const prompt =
    `You clean up scraped football prediction pages. ${opts.instructions}\n\n` +
    `Rules:\n` +
    `- Return one object per match that has a predicted final score. Skip matches that have no predicted score.\n` +
    `- Copy team names EXACTLY as written in the input (same spelling, accents and punctuation). ` +
    `Never translate, shorten, expand or correct a name. Never invent a match.\n` +
    `- home_score is the home team's predicted goals, away_score the away team's.\n` +
    `- If the input line has an id, return it unchanged in "id". Otherwise omit "id".\n` +
    `- Output JSON only.\n\nINPUT:\n${opts.input}`;

  await acquireGeminiSlot(); // waiting for a slot does not count against this call's deadline

  // Gemini regularly answers 503 ("high demand") or 429 for a few seconds at a time. Retry those (and only
  // those) with a short pause, inside one overall deadline so a slow day can never run past the caller's limit.
  const deadline = Date.now() + (opts.timeoutMs ?? 40000);
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: opts.maxOutputTokens ?? 32000,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  let res: Response | null = null;
  let lastError = 'no attempt made';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < 4000) break;
    try {
      res = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body,
        signal: AbortSignal.timeout(remaining),
      });
    } catch (err) {
      console.error(`[tipsterAi:${opts.source}] request threw:`, err);
      return { rows: [], returned: 0, rejected: 0, error: `request failed (attempt ${attempt}): ${String(err)}` };
    }
    if (res.ok) break;
    const errBody = (await res.text()).slice(0, 200);
    lastError = `Gemini HTTP ${res.status}: ${errBody}`;
    console.error(`[tipsterAi:${opts.source}] attempt ${attempt} non-OK:`, res.status, errBody);
    const retryable = res.status === 503 || res.status === 429 || res.status === 500;
    res = null;
    if (!retryable) break;
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }

  if (!res) return { rows: [], returned: 0, rejected: 0, error: lastError };

  let parsed: unknown;
  try {
    const json = await res.json();
    const parts: { text?: string }[] = json?.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p) => p.text ?? '').join('').replace(/```json|```/g, '').trim();
    parsed = JSON.parse(text);
  } catch (err) {
    console.error(`[tipsterAi:${opts.source}] bad JSON back:`, err);
    return { rows: [], returned: 0, rejected: 0, error: 'Gemini returned unparseable JSON (output may have been cut off)' };
  }

  if (!Array.isArray(parsed)) return { rows: [], returned: 0, rejected: 0, error: 'Gemini returned JSON that is not a list' };

  const globalCheck = typeof opts.checkSource === 'string' ? normalizeForCheck(opts.checkSource) : null;
  const seen = new Set<string>();
  const rows: AiMatchRow[] = [];
  let rejected = 0;

  for (const item of parsed as Record<string, unknown>[]) {
    const home = typeof item.home_team === 'string' ? item.home_team.trim() : '';
    const away = typeof item.away_team === 'string' ? item.away_team.trim() : '';
    const hs = Number(item.home_score);
    const as = Number(item.away_score);
    const id = typeof item.id === 'string' && item.id ? item.id : null;

    const scoresOk = Number.isInteger(hs) && Number.isInteger(as) && hs >= 0 && as >= 0 && hs <= 15 && as <= 15;
    const namesOk = home.length >= 2 && away.length >= 2;
    const idOk = !opts.allowedIds || (id !== null && opts.allowedIds.has(id));

    let inSource = false;
    if (scoresOk && namesOk && idOk) {
      const haystack =
        globalCheck !== null
          ? globalCheck
          : id !== null && opts.checkSource instanceof Map && opts.checkSource.has(id)
            ? normalizeForCheck(opts.checkSource.get(id)!)
            : null;
      inSource =
        haystack !== null && haystack.includes(normalizeForCheck(home)) && haystack.includes(normalizeForCheck(away));
    }

    const extraOk = !opts.scoreCheck || (scoresOk && opts.scoreCheck(hs, as));
    const dupKey = id ?? `${normalizeForCheck(home)}|${normalizeForCheck(away)}`;

    if (!scoresOk || !namesOk || !idOk || !inSource || !extraOk || seen.has(dupKey)) {
      rejected++;
      continue;
    }
    seen.add(dupKey);
    rows.push({ id, homeTeam: home, awayTeam: away, homeScore: hs, awayScore: as });
  }

  return { rows, returned: parsed.length, rejected, error: null };
}

// Runs several line-based extractions side by side and merges them. Used for long row lists.
export async function geminiExtractChunked(
  lines: string[],
  chunkSize: number,
  build: (chunkLines: string[]) => ExtractOptions,
): Promise<AiExtractResult> {
  const results = await Promise.all(chunk(lines, chunkSize).map((c) => geminiExtractMatches(build(c))));
  const errors = results.map((r) => r.error).filter((e): e is string => !!e);
  return {
    rows: results.flatMap((r) => r.rows),
    returned: results.reduce((n, r) => n + r.returned, 0),
    rejected: results.reduce((n, r) => n + r.rejected, 0),
    error: errors.length ? `${errors.length}/${results.length} chunk(s) failed: ${errors[0]}` : null,
  };
}
