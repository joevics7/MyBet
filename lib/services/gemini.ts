// Gemini's role here is narrow and deliberate: turn a stats model's
// already-computed numbers into one plain-English sentence. It does NOT
// generate the confidence score itself -- see poissonModel.ts for why.
//
// Model: gemini-3.5-flash via the generateContent endpoint (simpler,
// stateless, fully supported -- we don't need the newer multi-turn
// Interactions API for a single one-shot sentence).

const GEMINI_MODEL = 'gemini-3.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export interface ReasonInput {
  homeTeam: string;
  awayTeam: string;
  market: string;       // e.g. "1X2 - Home"
  score: number;         // 0-100, already computed by the stats model
  homeForm: string;      // e.g. "W-W-D-L-W" (most recent last)
  awayForm: string;
  homeGoalsAvg: number;  // goals scored per game, recent form
  awayGoalsAvg: number;
  // Optional extras for richer analysis (the Predictor passes these):
  modelProbability?: number; // our model's chance for the pick, 0-1
  bookOdds?: number;         // a real bookmaker's decimal odds for the pick
  bookName?: string;
}

// Templated fallback used when GEMINI_API_KEY isn't set, or the call
// fails -- the engine should never be blocked by Gemini being down. Less
// polished than an AI-written sentence, but never silently missing.
function templatedReason(input: ReasonInput): string {
  const { homeTeam, awayTeam, homeForm, awayForm, homeGoalsAvg, awayGoalsAvg } = input;
  const base = `${homeTeam} averaging ${homeGoalsAvg.toFixed(1)} goals/game (form: ${homeForm || 'n/a'}) vs ` +
    `${awayTeam} at ${awayGoalsAvg.toFixed(1)} (form: ${awayForm || 'n/a'}).`;
  if (input.modelProbability === undefined || !input.bookOdds) return base;
  const implied = Math.round((1 / input.bookOdds) * 100);
  return `${base} Our model gives ${Math.round(input.modelProbability * 100)}% against ${implied}% implied by the odds.`;
}

export async function generateReason(input: ReasonInput): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return templatedReason(input);

  const withOdds = input.modelProbability !== undefined && !!input.bookOdds;
  const prompt = `You write short, factual analysis explaining a football betting confidence score. ` +
    `Given this data, write ${withOdds ? 'TWO short sentences (max 40 words total)' : 'ONE sentence (max 20 words)'}, no emoji, ` +
    `no hedging like "might" or "could". First state the key factual reason behind the score (recent form, goals scored)` +
    `${withOdds ? '; then say how our model\'s probability compares with the probability implied by the bookmaker odds' : ''}. ` +
    `State facts only, never predict or guarantee an outcome.\n\n` +
    `Match: ${input.homeTeam} vs ${input.awayTeam}\n` +
    `Market: ${input.market}\n` +
    `Confidence score: ${input.score}/100\n` +
    `${input.homeTeam} recent form: ${input.homeForm}, averaging ${input.homeGoalsAvg.toFixed(1)} goals/game\n` +
    `${input.awayTeam} recent form: ${input.awayForm}, averaging ${input.awayGoalsAvg.toFixed(1)} goals/game` +
    (withOdds
      ? `\nOur model's probability for this pick: ${Math.round(input.modelProbability! * 100)}%` +
        `\n${input.bookName ?? 'Bookmaker'} odds: ${input.bookOdds!.toFixed(2)} (implied probability ${Math.round((1 / input.bookOdds!) * 100)}%)`
      : '');

  try {
    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 120, temperature: 0.3 },
      }),
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      console.error('[gemini] request failed:', res.status, (await res.text()).slice(0, 300));
      return templatedReason(input);
    }

    const json = await res.json();
    const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    return text?.trim() || templatedReason(input);
  } catch (err) {
    console.error('[gemini] request threw:', err);
    return templatedReason(input);
  }
}
