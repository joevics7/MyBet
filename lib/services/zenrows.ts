// Thin ZenRows client -- fetches a URL's rendered HTML through ZenRows'
// proxy/anti-bot infrastructure, for sites that block plain server-side
// fetch() (predictz.com, forebet.com -- both confirmed blocked by bot
// detection earlier in this project, same wall as Bet9ja/Akamai).

const ZENROWS_BASE_URL = 'https://api.zenrows.com/v1/';

function getApiKey(): string {
  const key = process.env.ZENROWS_API_KEY;
  if (!key) throw new Error('ZENROWS_API_KEY is not set.');
  return key;
}

export interface ZenRowsOptions {
  jsRender?: boolean; // render JavaScript before returning HTML -- costs more credits, needed for JS-heavy sites
  premiumProxy?: boolean; // route through a residential IP -- costs more credits, needed for tougher anti-bot sites
}

// Returns raw HTML, or null on failure (never throws -- callers should
// treat null the same as "source unavailable right now", same pattern as
// statarea.ts returning an empty array on failure).
export async function fetchViaZenRows(targetUrl: string, options: ZenRowsOptions = {}): Promise<string | null> {
  const params = new URLSearchParams({
    apikey: getApiKey(),
    url: targetUrl,
  });
  if (options.jsRender) params.set('js_render', 'true');
  if (options.premiumProxy) params.set('premium_proxy', 'true');

  let res: Response;
  try {
    res = await fetch(`${ZENROWS_BASE_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(20000), // ZenRows can be slow when it has to escalate bypass layers
    });
  } catch (err) {
    console.error('[zenrows] fetch threw:', targetUrl, err);
    return null;
  }

  if (!res.ok) {
    console.error('[zenrows] non-OK response:', targetUrl, res.status, (await res.text()).slice(0, 300));
    return null;
  }

  return res.text();
}
