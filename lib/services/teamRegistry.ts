// Team-name registry: every spelling we know for a team, grouped under one team id, so the four tipster
// sources (and later the betting platforms) can be matched exactly instead of guessed from letters.
//
// HOW IT LEARNS (run by /api/cron/team-aliases after the daily scrape)
//   Vitibet is the SPINE: each of its matches has a fixture id and a consistent spelling, and that spelling
//   becomes the team's canonical name. For every match from the other sources:
//     1. Already known (both teams resolve to the spine fixture's teams)        -> nothing to do
//     2. Names clearly match a spine fixture (both teams >= 0.8 similar)         -> learned without AI
//     3. Otherwise, shortlist spine fixtures where at least one team looks alike,
//        and ask Gemini which one (if any) is the SAME real fixture              -> learned via AI
//     4. No look-alike candidate at all                                          -> left alone
//   Step 3 is what fixes "Spurs v Everton" vs "Tottenham Hotspur v Everton": the opponent anchors it.
//
// WHAT KEEPS GEMINI HONEST (it never invents names -- it only picks among candidates we gave it)
//   - the fixture it picks must be one of THAT row's shortlisted candidates
//   - it must label its own confidence "high"; anything else is dropped
//   - one spine fixture can be claimed by at most one row per source
//   - a spelling that is already stored for another team is never overwritten
//
// Betting-platform names plug in later through addPlatformVariants(): same table, source = the platform.

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { callGeminiJson, chunk } from './tipsterAi';
import { findByNames, resolveTeam, teamKey, teamSimilarity, type TeamRegistry } from './teamNameMatch';

// ---------------------------------------------------------------- building / loading

export function emptyRegistry(): TeamRegistry {
  return { idByKey: new Map(), canonicalById: new Map(), variantsById: new Map() };
}

export function buildRegistry(
  aliases: { id: string; canonical_name: string }[],
  variants: { alias_id: string; variant: string }[],
): TeamRegistry {
  const reg = emptyRegistry();
  for (const a of aliases) {
    reg.canonicalById.set(a.id, a.canonical_name);
    reg.variantsById.set(a.id, [a.canonical_name]);
    reg.idByKey.set(teamKey(a.canonical_name), a.id);
  }
  for (const v of variants) {
    if (!reg.canonicalById.has(v.alias_id)) continue;
    const key = teamKey(v.variant);
    if (!reg.idByKey.has(key)) reg.idByKey.set(key, v.alias_id);
    reg.variantsById.get(v.alias_id)!.push(v.variant);
  }
  return reg;
}

async function readAll<T>(table: string, columns: string): Promise<T[] | null> {
  const admin = getSupabaseAdmin();
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin.from(table).select(columns).order('id', { ascending: true }).range(from, from + PAGE - 1);
    if (error || !data) {
      console.error(`[teamRegistry] read ${table} failed:`, error);
      return null;
    }
    out.push(...(data as unknown as T[]));
    if (data.length < PAGE) break;
  }
  return out;
}

// Never throws: a registry that fails to load just means matching falls back to plain fuzzy, as before.
export async function loadTeamRegistry(): Promise<TeamRegistry> {
  try {
    const aliases = await readAll<{ id: string; canonical_name: string }>('team_aliases', 'id, canonical_name');
    const variants = await readAll<{ id: string; alias_id: string; variant: string }>('team_alias_variants', 'id, alias_id, variant');
    if (!aliases || !variants) return emptyRegistry();
    return buildRegistry(aliases, variants);
  } catch (err) {
    console.error('[teamRegistry] load threw:', err);
    return emptyRegistry();
  }
}

// ---------------------------------------------------------------- learning (pure planning)

export interface SpineFixture {
  id: string;
  home: string;
  away: string;
}

export interface SourceRow {
  rowId: string;
  source: string;
  home: string;
  away: string;
}

export interface LearnedVariant {
  canonicalName: string;
  variant: string;
  source: string;
  via: 'spine' | 'fuzzy' | 'ai' | 'platform';
}

export interface AiCandidateRow {
  row: SourceRow;
  candidates: SpineFixture[]; // up to 6 spine fixtures where at least one team looks alike
}

export interface LearningPlan {
  learned: LearnedVariant[];
  needAi: AiCandidateRow[];
  alreadyKnown: number;
  noCandidates: number;
}

const AUTO_LEARN_MIN = 0.8; // each team must be at least this similar for a no-AI learn
const CANDIDATE_MIN = 0.4;
const MAX_CANDIDATES = 6;

// One-word spellings that could belong to several famous clubs ("Barcelona" = Barcelona SC or FC Barcelona?).
// They still match inside a single fixture (the opponent anchors it), but are never saved as a global alias, and
// never become a registry team either: Vitibet spells two different clubs "Arsenal" (England, and Dzerzhinsk in
// Belarus), which a one-team-per-name registry would silently merge.
const AMBIGUOUS_SINGLE_NAMES = new Set([
  'barcelona', 'paris', 'madrid', 'milan', 'manchester', 'newcastle', 'sporting', 'real', 'atletico', 'athletic',
  'racing', 'nacional', 'olimpia', 'dynamo', 'dinamo', 'spartak', 'lokomotiv', 'central', 'independiente',
  'estudiantes', 'union', 'olympique', 'inter', 'internacional', 'universidad', 'deportivo', 'juventud', 'san',
  'arsenal', 'olympiakos', 'olympiacos', 'city', 'united', 'rovers', 'wanderers', 'town', 'rangers', 'celtic', 'villa', 'palace', 'river', 'boca',
]);

export function isSafeToSave(variant: string): boolean {
  const key = teamKey(variant);
  if (!key) return false;
  return !(key.split(' ').length === 1 && AMBIGUOUS_SINGLE_NAMES.has(key));
}

// The name a team should be stored under: its existing canonical name if the registry already knows it.
function canonicalFor(registry: TeamRegistry, spineName: string): string {
  const id = resolveTeam(registry, spineName);
  return (id && registry.canonicalById.get(id)) || spineName;
}

export function planAliasLearning(spine: SpineFixture[], rows: SourceRow[], registry: TeamRegistry): LearningPlan {
  const learned: LearnedVariant[] = [];
  const needAi: AiCandidateRow[] = [];
  let alreadyKnown = 0;
  let noCandidates = 0;
  const spineNamed = spine.map((f) => ({ homeTeam: f.home, awayTeam: f.away, fixture: f }));

  const learn = (spineName: string, variant: string, source: string, via: LearnedVariant['via']) => {
    // a spelling already stored (for this or any team) is never re-learned or overwritten
    if (registry.idByKey.has(teamKey(variant)) || !isSafeToSave(variant) || !isSafeToSave(spineName)) return;
    learned.push({ canonicalName: canonicalFor(registry, spineName), variant, source, via });
  };

  for (const row of rows) {
    // 1. already known?
    const hid = resolveTeam(registry, row.home);
    const aid = resolveTeam(registry, row.away);
    if (hid && aid && spine.some((f) => resolveTeam(registry, f.home) === hid && resolveTeam(registry, f.away) === aid)) {
      alreadyKnown++;
      continue;
    }

    // 2. clear fuzzy match -> learn without AI
    const best = findByNames(spineNamed, row.home, row.away, registry)?.item.fixture;
    if (best) {
      const h = teamSimilarity(row.home, best.home, registry);
      const a = teamSimilarity(row.away, best.away, registry);
      if (h >= AUTO_LEARN_MIN && a >= AUTO_LEARN_MIN) {
        learn(best.home, row.home, row.source, 'fuzzy');
        learn(best.away, row.away, row.source, 'fuzzy');
        // make sure the spine's own spelling is stored too, so the canonical team exists
        learn(best.home, best.home, 'vitibet', 'spine');
        learn(best.away, best.away, 'vitibet', 'spine');
        continue;
      }
    }

    // 3. shortlist look-alike spine fixtures for the AI
    const scored = spine
      .map((f) => ({ f, s: Math.max(teamSimilarity(row.home, f.home, registry), teamSimilarity(row.away, f.away, registry)) }))
      .filter((x) => x.s >= CANDIDATE_MIN)
      .sort((x, y) => y.s - x.s)
      .slice(0, MAX_CANDIDATES);
    if (scored.length === 0) {
      noCandidates++;
      continue;
    }
    needAi.push({ row, candidates: scored.map((x) => x.f) });
  }

  return { learned: dedupeLearned(learned), needAi, alreadyKnown, noCandidates };
}

export function dedupeLearned(list: LearnedVariant[]): LearnedVariant[] {
  const seen = new Set<string>();
  const out: LearnedVariant[] = [];
  for (const l of list) {
    const key = teamKey(l.variant);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(l);
  }
  return out;
}

// ---------------------------------------------------------------- learning (Gemini step)

const AI_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      row_id: { type: 'STRING' },
      fixture_id: { type: 'STRING' }, // a candidate's id, or "none"
      confidence: { type: 'STRING' }, // "high" or "low"
    },
    required: ['row_id', 'fixture_id', 'confidence'],
  },
};

export interface AiResolveResult {
  learned: LearnedVariant[];
  asked: number;
  accepted: number;
  rejected: number; // not high confidence / not a candidate / duplicate claim
  none: number; // Gemini said no candidate is the same fixture
  error: string | null;
}

const AI_ROWS_PER_CALL = 60;

// Exported for tests: validates one batch of Gemini's answers against the rows it was asked about.
export function validateAiAnswers(
  answers: unknown,
  batch: AiCandidateRow[],
  claimed: Set<string>,
  registry: TeamRegistry,
): { learned: LearnedVariant[]; accepted: number; rejected: number; none: number } {
  const byRow = new Map(batch.map((b) => [b.row.rowId, b]));
  const learned: LearnedVariant[] = [];
  let accepted = 0, rejected = 0, none = 0;
  const answered = new Set<string>();

  if (!Array.isArray(answers)) return { learned, accepted, rejected: batch.length, none };

  for (const a of answers as Record<string, unknown>[]) {
    const rowId = typeof a.row_id === 'string' ? a.row_id : '';
    const fixtureId = typeof a.fixture_id === 'string' ? a.fixture_id : '';
    const item = byRow.get(rowId);
    if (!item || answered.has(rowId)) { rejected++; continue; }
    answered.add(rowId);

    if (fixtureId === 'none' || fixtureId === '') { none++; continue; }
    const target = item.candidates.find((c) => c.id === fixtureId); // must be one of THIS row's candidates
    const claimKey = `${item.row.source}|${fixtureId}`;
    if (a.confidence !== 'high' || !target || claimed.has(claimKey)) { rejected++; continue; }

    claimed.add(claimKey);
    accepted++;
    const add = (spineName: string, variant: string, source: string, via: LearnedVariant['via']) => {
      if (registry.idByKey.has(teamKey(variant)) || !isSafeToSave(variant) || !isSafeToSave(spineName)) return;
      learned.push({ canonicalName: canonicalFor(registry, spineName), variant, source, via });
    };
    add(target.home, item.row.home, item.row.source, 'ai');
    add(target.away, item.row.away, item.row.source, 'ai');
    add(target.home, target.home, 'vitibet', 'spine');
    add(target.away, target.away, 'vitibet', 'spine');
  }
  return { learned, accepted, rejected, none };
}

export async function resolveWithAi(needAi: AiCandidateRow[], registry: TeamRegistry, maxCalls = 6): Promise<AiResolveResult> {
  const batches = chunk(needAi, AI_ROWS_PER_CALL).slice(0, maxCalls); // the rest is picked up by the next run
  const asked = batches.reduce((n, b) => n + b.length, 0);
  const claimed = new Set<string>();

  const calls = await Promise.all(
    batches.map((batch) => {
      const lines = batch.map(
        (b) => `${b.row.rowId} | ${b.row.source} | ${b.row.home} v ${b.row.away} || ` + b.candidates.map((c) => `${c.id}: ${c.home} v ${c.away}`).join(' ; '),
      );
      const prompt =
        `You match football fixtures between different prediction websites that spell team names differently ` +
        `(e.g. "Spurs" = "Tottenham Hotspur", "Man Utd" = "Manchester United", "Paris SG" = "Paris Saint-Germain").\\n` +
        `Each input line is: row_id | source | Home v Away || candidate fixtures as "fixture_id: Home v Away" separated by " ; ".\\n` +
        `For each row decide which candidate is the SAME real fixture: the same two clubs, the same home/away order. ` +
        `Reserve, youth and women's teams are different clubs from the senior men's team. ` +
        `Answer with the candidate's fixture_id, or "none" if no candidate is the same fixture. ` +
        `Set confidence to "high" only if you are certain; otherwise "low". Never guess. Only use fixture_ids listed on that row's line. ` +
        `Return one object per row, JSON only.\\n\\nINPUT:\\n${lines.join('\\n')}`;
      return callGeminiJson({ source: 'team-aliases', prompt, schema: AI_SCHEMA, maxOutputTokens: 8000, timeoutMs: 40000 }).then((r) => ({ batch, r }));
    }),
  );

  const out: AiResolveResult = { learned: [], asked, accepted: 0, rejected: 0, none: 0, error: null };
  const errors: string[] = [];
  for (const { batch, r } of calls) {
    if (r.error) { errors.push(r.error); continue; }
    const v = validateAiAnswers(r.json, batch, claimed, registry);
    out.learned.push(...v.learned);
    out.accepted += v.accepted;
    out.rejected += v.rejected;
    out.none += v.none;
  }
  if (errors.length) out.error = `${errors.length}/${calls.length} call(s) failed: ${errors[0]}`;
  out.learned = dedupeLearned(out.learned);
  return out;
}

// ---------------------------------------------------------------- saving

export async function saveLearnedVariants(learned: LearnedVariant[]): Promise<{ teams: number; variants: number; error: string | null }> {
  const list = dedupeLearned(learned).filter((l) => isSafeToSave(l.variant) && isSafeToSave(l.canonicalName));
  if (list.length === 0) return { teams: 0, variants: 0, error: null };
  const admin = getSupabaseAdmin();

  const canonicals = new Map<string, string>(); // canonical_key -> canonical_name
  for (const l of list) canonicals.set(teamKey(l.canonicalName), l.canonicalName);

  const { data: aliasRows, error: aliasErr } = await admin
    .from('team_aliases')
    .upsert(
      Array.from(canonicals.entries()).map(([canonical_key, canonical_name]) => ({ canonical_key, canonical_name })),
      { onConflict: 'canonical_key' },
    )
    .select('id, canonical_key');
  if (aliasErr || !aliasRows) {
    console.error('[teamRegistry] saving teams failed:', aliasErr);
    return { teams: 0, variants: 0, error: aliasErr?.message ?? 'no rows returned' };
  }
  const idByCanonicalKey = new Map(aliasRows.map((r: { id: string; canonical_key: string }) => [r.canonical_key, r.id]));

  const variantRows = list
    .map((l) => ({
      alias_id: idByCanonicalKey.get(teamKey(l.canonicalName)),
      variant: l.variant,
      variant_key: teamKey(l.variant),
      source: l.source,
      learned_via: l.via,
    }))
    .filter((r) => r.alias_id && r.variant_key);

  let saved = 0;
  for (const part of chunk(variantRows, 500)) {
    // ignoreDuplicates: a spelling that already belongs to a team is left exactly as it is
    const { data, error } = await admin.from('team_alias_variants').upsert(part, { onConflict: 'variant_key', ignoreDuplicates: true }).select('id');
    if (error) {
      console.error('[teamRegistry] saving variants failed:', error);
      return { teams: aliasRows.length, variants: saved, error: error.message };
    }
    saved += data?.length ?? 0;
  }
  return { teams: aliasRows.length, variants: saved, error: null };
}

// For later: names a betting platform uses for a team we already know, e.g.
//   addPlatformVariants('Inter Milan', ['FC Internazionale Milano'], 'sportybet')
export async function addPlatformVariants(canonicalName: string, names: string[], platform: string) {
  return saveLearnedVariants(names.map((variant) => ({ canonicalName, variant, source: platform, via: 'platform' as const })));
}

