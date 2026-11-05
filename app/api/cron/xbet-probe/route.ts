import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ONE-OFF CHECK (no API-Football requests): can we read a 1xBet-style site's football match list from the server?
// The Predictor's "create a code" needs each site's own game ids, and finding a game there needs a list of its matches.
// Usage: /api/cron/xbet-probe?site=paripesa   (sites: paripesa, 1xbet, melbet, helabet, betwinner, afropari)
// &mode=discover tries other list endpoints. Optional: &gr=<group number> for sites whose group we do not know. Same Authorization header as the other crons.
const SITES: Record<string, { origin: string; ref: number; gr?: number }> = {
  paripesa: { origin: 'https://paripesa.ng', ref: 188, gr: 758 },
  '1xbet': { origin: 'https://1xbet.ng', ref: 159, gr: 412 },
  melbet: { origin: 'https://melbet.com', ref: 8 },
  helabet: { origin: 'https://helabet.ng', ref: 237 },
  betwinner: { origin: 'https://betwinner.ng', ref: 152 },
  afropari: { origin: 'https://afropari.com', ref: 300 },
};

function describe(json: any) {
  const arr = Array.isArray(json) ? json : Array.isArray(json?.items) ? json.items : null;
  return {
    type: Array.isArray(json) ? 'array' : typeof json,
    topLevelKeys: json && !Array.isArray(json) && typeof json === 'object' ? Object.keys(json).slice(0, 12) : undefined,
    count: arr ? arr.length : undefined,
    firstItemKeys: arr?.[0] && typeof arr[0] === 'object' ? Object.keys(arr[0]).slice(0, 20) : undefined,
    firstItem: arr?.[0] ? JSON.stringify(arr[0]).slice(0, 700) : JSON.stringify(json)?.slice(0, 400),
  };
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const ok = secret ? req.headers.get('authorization') === `Bearer ${secret}` : process.env.NODE_ENV !== 'production';
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const site = req.nextUrl.searchParams.get('site') ?? 'paripesa';
  const cfg = SITES[site];
  if (!cfg) return NextResponse.json({ error: `Unknown site. Use one of: ${Object.keys(SITES).join(', ')}` }, { status: 400 });
  const gr = Number(req.nextUrl.searchParams.get('gr')) || cfg.gr;

  const day = new Date().toISOString().slice(0, 10);
  const from = Math.floor(Date.parse(`${day}T00:00:00Z`) / 1000);
  const to = from + 86400;
  const common = `cfView=3&fcountry=132&grMode=4&lng=en&ref=${cfg.ref}${gr ? `&gr=${gr}` : ''}`;
  const feed = '/service-api/main-line-feed/v3';
  const discover = req.nextUrl.searchParams.get('mode') === 'discover';
  // mode=discover: look for the call that lists football leagues / games (the plain day list answered 400)
  const discovery: Record<string, string> = {
    'GlobalChamp1x2 id=7 (works on 1xBet)': `${feed}/GlobalChamp1x2?cfView=3&count=70&fcountry=132&grMode=4&id=7&lng=en&ref=${cfg.ref}${gr ? `&gr=${gr}` : ''}`,
    'champs for football': `${feed}/champs?sportId=1&fcountry=132&lng=en&ref=${cfg.ref}${gr ? `&gr=${gr}` : ''}`,
    'globalChamps for football': `${feed}/globalChamps?sportId=1&fcountry=132&lng=en&ref=${cfg.ref}${gr ? `&gr=${gr}` : ''}`,
    'sports list': `${feed}/sports?fcountry=132&lng=en&ref=${cfg.ref}${gr ? `&gr=${gr}` : ''}`,
    'top games football': `${feed}/topGames?sportId=1&count=50&fcountry=132&grMode=4&lng=en&ref=${cfg.ref}${gr ? `&gr=${gr}` : ''}`,
    'games1x2 with sportId + countOnly': `${feed}/games1x2?cfView=3&count=50&fcountry=132&grMode=4&lng=en&ref=${cfg.ref}${gr ? `&gr=${gr}` : ''}&sportId=1&dateFrom=${from}&dateTo=${to}&selectedMs=1.1.0`,
  };
  const variants: Record<string, string> = discover ? discovery : {
    'day list (no market filter)': `/service-api/main-line-feed/v3/games1x2?${common}&count=300&dateFrom=${from}&dateTo=${to}`,
    'day list, football only': `/service-api/main-line-feed/v3/games1x2?${common}&count=300&dateFrom=${from}&dateTo=${to}&sportIds=1`,
    'day list, sports=1': `/service-api/main-line-feed/v3/games1x2?${common}&count=300&dateFrom=${from}&dateTo=${to}&sports=1`,
  };

  const out: Record<string, unknown> = {};
  for (const [name, path] of Object.entries(variants)) {
    try {
      const res = await fetch(`${cfg.origin}${path}`, {
        headers: {
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          Origin: cfg.origin,
          Referer: `${cfg.origin}/en/line/football`,
          'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
        },
        cache: 'no-store',
      });
      const text = await res.text();
      if (/^\s*</.test(text)) { out[name] = { status: res.status, blocked: 'got an HTML page (Cloudflare / security check)', start: text.slice(0, 120) }; continue; }
      let json: unknown;
      try { json = JSON.parse(text); } catch { out[name] = { status: res.status, notJson: text.slice(0, 200) }; continue; }
      out[name] = { status: res.status, ...describe(json) };
    } catch (err) {
      out[name] = { error: err instanceof Error ? err.message : String(err) };
    }
  }
  return NextResponse.json({ site, gr: gr ?? null, results: out });
}
