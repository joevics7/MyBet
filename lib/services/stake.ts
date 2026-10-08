// Stake Decode Service (decode only).
//
// Stake has no booking codes. A share link carries the ID of a PLACED bet,
// e.g. "sport:431396341" (Stake's `iid` field). We accept either the full
// link (stake.com/sports/home?bet=...) or the bare ID, look the bet up over
// Stake's GraphQL endpoint, and normalise its legs. No create path exists.
//
// Field names (outcomes{odds, fixtureName, outcome{name}, fixture{name,status}})
// come from public reverse-engineered queries. The single-bet lookup
// `bet(iid:)` was NOT found in any public source, so it is UNVERIFIED: we try
// it with the market name first, retry without it if the schema rejects that,
// and log Stake's raw error so the query can be corrected from real output.
//
// Cloudflare may block server-side calls to stake.com (as with Bet9ja).

import type { DecodeResult, NormalizedSelection } from './types';

const STAKE_GRAPHQL = 'https://stake.com/_api/graphql';
const EMPTY: DecodeResult = { status: 'invalid', shareCode: null, selections: [], totalOdds: null, raw: null };

// "sport:431396341" | "...?bet=sport%3A431396341" | "...?iid=sport:431396341" | "431396341"
export function parseStakeBetId(input: string): string | null {
  let text = input.trim();
  try {
    text = decodeURIComponent(text);
  } catch {
    /* keep raw */
  }
  const m = text.match(/(?:^|[=/?&\s])((?:sport|casino|[a-z]+):\d{5,})/i) ?? text.match(/^(\d{5,})$/);
  if (!m) return null;
  return m[1].includes(':') ? m[1].toLowerCase() : `sport:${m[1]}`;
}

const outcomesFields = (withMarket: boolean) => `
  odds
  fixtureName
  outcome { name }
  ${withMarket ? 'market { name specifiers }' : ''}
  fixture { name status }
`;

const buildQuery = (withMarket: boolean) => `
query BetLookup($iid: String!) {
  bet(iid: $iid) {
    iid
    bet {
      __typename
      ... on SportBet {
        id
        status
        potentialMultiplier
        outcomes { ${outcomesFields(withMarket)} }
      }
    }
  }
}`;

type Json = Record<string, any>;

async function lookup(iid: string, withMarket: boolean): Promise<{ json?: Json; error?: string }> {
  try {
    const res = await fetch(STAKE_GRAPHQL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Origin: 'https://stake.com',
        Referer: 'https://stake.com/sports/home',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body: JSON.stringify({ operationName: 'BetLookup', query: buildQuery(withMarket), variables: { iid } }),
      signal: AbortSignal.timeout(8000),
    });
    const text = await res.text();
    if (!res.ok) return { error: `HTTP ${res.status}: ${text.slice(0, 300)}` };
    const json = JSON.parse(text) as Json;
    if (json.errors?.length) return { error: JSON.stringify(json.errors).slice(0, 400), json };
    return { json };
  } catch (err) {
    return { error: String(err) };
  }
}

// Stake fixture names look like "Mexico - South Africa" or "A vs B".
function splitTeams(name: string): [string, string] | null {
  const parts = name.split(/\s+(?:-|–|vs\.?|v)\s+/i);
  return parts.length === 2 ? [parts[0].trim(), parts[1].trim()] : null;
}

export async function decodeStakeBet(input: string): Promise<DecodeResult> {
  const iid = parseStakeBetId(input);
  if (!iid) return EMPTY;

  let { json, error } = await lookup(iid, true);
  if (error) {
    console.error('[stake decode] with market failed:', error);
    ({ json, error } = await lookup(iid, false)); // schema may reject market{}
    if (error) {
      console.error('[stake decode] fallback failed:', error);
      return EMPTY;
    }
  }

  const betNode = json?.data?.bet?.bet;
  const outcomes: Json[] | undefined = betNode?.outcomes;
  if (!Array.isArray(outcomes) || outcomes.length === 0) return { ...EMPTY, raw: json ?? null };

  const selections: NormalizedSelection[] = [];
  for (const o of outcomes) {
    const fixtureName: string | undefined = o.fixtureName ?? o.fixture?.name;
    const teams = fixtureName ? splitTeams(fixtureName) : null;
    const odds = Number(o.odds);
    if (!teams || !Number.isFinite(odds)) continue;

    const status: string | null = o.fixture?.status ?? null;
    const market = [o.market?.name, o.outcome?.name].filter(Boolean).join(' - ') || 'Unknown market';
    selections.push({
      externalEventId: fixtureName!,
      homeTeam: teams[0],
      awayTeam: teams[1],
      market,
      odds,
      kickoffAt: null, // not in the known field set
      isLocked: status ? ['live', 'ended', 'closed', 'cancelled'].includes(status.toLowerCase()) : false,
      matchStatus: status,
      isWinning: null,
    });
  }
  if (selections.length === 0) return { ...EMPTY, raw: json ?? null };

  const total = Number(betNode.potentialMultiplier) || selections.reduce((a, s) => a * s.odds, 1);
  return { status: 'ok', shareCode: iid, selections, totalOdds: Math.round(total * 100) / 100, raw: json ?? null };
}
