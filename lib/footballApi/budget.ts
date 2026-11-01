// Hard daily request budget for API-Football, counted in the database so it holds across every server instance.
// Plan: 1 (day list) + 80 (team form) + 5 (scores) = 86. DAILY_CAP stays under the 90 limit you set.

import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const DAILY_CAP = 88;
export const SCORE_RUNS_RESERVED = 5; // the daily job leaves this many requests for the score job

const today = () => new Date().toISOString().slice(0, 10);

export interface Budget {
  used: () => number;
  tryUse: () => boolean; // true = you may make ONE request now (it is counted)
  flush: () => Promise<void>;
}

// reserve = requests this caller must leave unspent for other jobs (the daily job passes SCORE_RUNS_RESERVED).
export async function openBudget(reserve = 0): Promise<Budget> {
  const day = today();
  let used = 0;
  let saved = 0;
  try {
    const { data } = await getSupabaseAdmin().from('football_api_usage').select('used').eq('day', day).maybeSingle();
    used = saved = data?.used ?? 0;
  } catch (err) {
    // Can't read the counter (table missing / Supabase down): refuse to spend rather than risk the quota.
    console.error('[footballApi budget] cannot read usage, spending nothing:', err);
    used = saved = DAILY_CAP;
  }
  const flush = async () => {
    if (used === saved) return;
    const { error } = await getSupabaseAdmin().from('football_api_usage').upsert({ day, used, updated_at: new Date().toISOString() }, { onConflict: 'day' });
    if (error) console.error('[footballApi budget] could not save usage:', error.message);
    else saved = used;
  };
  return {
    used: () => used,
    tryUse: () => {
      if (used + 1 > DAILY_CAP - reserve) return false;
      used += 1;
      return true;
    },
    flush,
  };
}
