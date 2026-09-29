import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Null, not throwing, when env vars aren't set yet -- so a page/route that
// imports this file doesn't crash the whole app before it even runs.
// Callers should check `if (!supabase)` before using it.
export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
        },
      })
    : null;

// ---- Core domain types, mirroring supabase/migrations schema ----

export type Platform = {
  id: string;
  slug: string; // e.g. 'sportybet', 'bet9ja', '1xbet', 'betking'
  name: string;
  is_supported_decode: boolean;
  is_supported_encode: boolean;
  code_format_regex: string | null;
  deep_link_template: string | null; // e.g. https://sportybet.com/ng/booking/{code}
  affiliate_base_url: string | null;
  sort_order: number;
  created_at: string;
};

export type DecodedSelection = {
  id: string;
  decode_id: string;
  platform_id: string;
  external_event_id: string | null;
  home_team: string;
  away_team: string;
  market: string;
  odds: number;
  kickoff_at: string | null;
  is_locked: boolean; // game already started
  created_at: string;
};

export type Decode = {
  id: string;
  platform_id: string;
  source_code: string;
  status: 'ok' | 'invalid' | 'expired' | 'unsupported_platform';
  raw_response: Record<string, unknown> | null;
  created_at: string;
  selections?: DecodedSelection[];
};

export type ConfidenceScore = {
  id: string;
  platform_id: string;
  external_event_id: string;
  market: string;
  score: number; // 0-100
  reason: string | null;
  computed_at: string;
  expires_at: string; // 24h cache window
};

export type OddsQuote = {
  id: string;
  platform_id: string;
  external_event_id: string;
  market: string;
  odds: number;
  fetched_at: string;
  expires_at: string; // 5-10 min cache window
};

export type VaultEntry = {
  id: string;
  user_id: string;
  platform_id: string;
  code: string;
  decode_id: string | null;
  status: 'pending' | 'won' | 'lost' | 'void' | 'unable_to_check';
  saved_at: string;
  settled_at: string | null;
  legs_total: number;
  legs_correct: number | null;
};

export type UserSettings = {
  user_id: string;
  telegram_chat_id: string | null;
  bankroll: number | null;
  kelly_fraction: number; // 0.25 default (quarter Kelly)
  notifications_muted: boolean;
  created_at: string;
  updated_at: string;
};

export type Fixture = {
  id: string;
  external_event_id: string;
  home_team: string;
  away_team: string;
  competition: string | null;
  kickoff_at: string;
  status: 'scheduled' | 'live' | 'finished' | 'postponed' | 'abandoned';
  home_score: number | null;
  away_score: number | null;
  updated_at: string;
};
