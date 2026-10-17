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

const GEMINI_MODEL = 'gemini-3.5-flash';
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

  let res: Response;
  try {
    res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: opts.maxOutputTokens ?? 32000,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 40000),
    });
  } catch (err) {
    console.error(`[tipsterAi:${opts.source}] request threw:`, err);
    return { rows: [], returned: 0, rejected: 0, error: `request failed: ${String(err)}` };
  }

  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    console.error(`[tipsterAi:${opts.source}] non-OK:`, res.status, body);
    return { rows: [], returned: 0, rejected: 0, error: `Gemini HTTP ${res.status}: ${body}` };
  }

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
