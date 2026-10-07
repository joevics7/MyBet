// Forebet raw-fetch -- NOT parsed yet, deliberately. Forebet was
// bot-blocked for direct inspection earlier in this project (same as
// predictz); ZenRows should get past that, but no parser gets written
// until real fetched content has actually been looked at. See
// predictz.ts's history for why: a parser written blind against a never-
// seen layout shipped and reliably returned 0 results.

import { fetchAndStripViaZenRows } from './zenrows';

const FOREBET_URL = 'https://www.forebet.com/';

export async function fetchForebetRawText(): Promise<string | null> {
  return fetchAndStripViaZenRows(FOREBET_URL, { jsRender: true, premiumProxy: true });
}
