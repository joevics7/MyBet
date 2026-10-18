// Shared team-name matching for the tipster sources. Each site spells teams differently
// ("Bayern München" / "Bayern Munich", "Inter" / "Inter Milan", "Red Star" / "RED Star FC 93",
// "St Etienne" / "Saint Etienne", "Betis" / "Real Betis"), so exact comparison is not enough.
//
// Score for one pair of names (0-1):
//   1.0   identical after normalisation
//   0.92  one name's words are all contained in the other's ("Inter" in "Inter Milan")
//   else  bigram (Dice) similarity
// A match needs BOTH teams above PER_TEAM_THRESHOLD, because a strong match on one side must not
// rescue a bad match on the other (that is almost always a different fixture, not a spelling quirk).
//
// Guard: reserve/women/youth markers must agree on both sides, so "Arsenal W" never matches "Arsenal".

const DROP_WORDS = new Set(['fc', 'cf', 'sc', 'afc', 'cfc', 'ca', 'ac', 'ud', 'cd', 'if', 'bk', 'fk', 'sd', 'srl', 'rc', 'sk', 'ssc', 'club', 'de', 'the']);
const ALIASES: Record<string, string> = {
  st: 'saint', utd: 'united', intl: 'international', munchen: 'munich', koln: 'cologne',
  nurnberg: 'nuremberg', wien: 'vienna', brest: 'brestois',
};
const SEGMENT_MARKERS = new Set(['w', 'women', 'ii', 'iii', 'b', 'u17', 'u18', 'u19', 'u20', 'u21', 'u23', 'res', 'reserves', 'youth']);

export function nameTokens(name: string): string[] {
  const cleaned = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ');
  return cleaned
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => ALIASES[t] ?? t)
    .filter((t) => !DROP_WORDS.has(t));
}

function bigrams(s: string): Set<string> {
  const padded = ` ${s} `;
  const grams = new Set<string>();
  for (let i = 0; i < padded.length - 1; i++) grams.add(padded.slice(i, i + 2));
  return grams;
}

export function nameSimilarity(a: string, b: string): number {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;

  const markerA = ta.filter((t) => SEGMENT_MARKERS.has(t)).sort().join(',');
  const markerB = tb.filter((t) => SEGMENT_MARKERS.has(t)).sort().join(',');
  if (markerA !== markerB) return 0;

  const ja = ta.join(' ');
  const jb = tb.join(' ');
  if (ja === jb) return 1;

  const setA = new Set(ta);
  const setB = new Set(tb);
  const aInB = ta.every((t) => setB.has(t));
  const bInA = tb.every((t) => setA.has(t));
  if (aInB || bInA) return 0.92;

  const dice = bigramDice(ja, jb);

  // Same city/region word but a different distinguishing word ("Manchester City" / "Manchester United",
  // "Real Madrid" / "Atletico Madrid") is a DIFFERENT team, however high the character overlap looks.
  // Cap those. Short leftovers ("SV", "CP") and abbreviations/prefixes ("Atl" / "Atletico") are not capped.
  const onlyA = ta.filter((t) => !setB.has(t));
  const onlyB = tb.filter((t) => !setA.has(t));
  const shared = ta.length - onlyA.length;
  if (shared > 0) {
    const distinctA = onlyA.filter((t) => t.length >= 3);
    const distinctB = onlyB.filter((t) => t.length >= 3);
    const aHasStranger = distinctA.some((x) => !onlyB.some((y) => tokenSimilar(x, y)));
    const bHasStranger = distinctB.some((y) => !onlyA.some((x) => tokenSimilar(x, y)));
    if (aHasStranger && bHasStranger) return Math.min(dice, 0.5);
  }
  return dice;
}

function bigramDice(a: string, b: string): number {
  const ga = bigrams(a);
  const gb = bigrams(b);
  let overlap = 0;
  Array.from(ga).forEach((g) => {
    if (gb.has(g)) overlap++;
  });
  return (2 * overlap) / (ga.size + gb.size);
}

function tokenSimilar(x: string, y: string): boolean {
  if (x === y) return true;
  if (Math.min(x.length, y.length) >= 3 && (x.startsWith(y) || y.startsWith(x))) return true;
  return bigramDice(x, y) >= 0.6;
}

export const PER_TEAM_THRESHOLD = 0.6;

export interface NamedFixture {
  homeTeam: string;
  awayTeam: string;
}

// Best fixture in `items` for the given names, or null. Ties go to the higher combined score.
export function findByNames<T extends NamedFixture>(items: T[], homeTeam: string, awayTeam: string): { item: T; score: number } | null {
  let best: { item: T; score: number } | null = null;
  for (const item of items) {
    const h = nameSimilarity(homeTeam, item.homeTeam);
    if (h < PER_TEAM_THRESHOLD) continue;
    const a = nameSimilarity(awayTeam, item.awayTeam);
    if (a < PER_TEAM_THRESHOLD) continue;
    const score = (h + a) / 2;
    if (!best || score > best.score) best = { item, score };
  }
  return best;
}
