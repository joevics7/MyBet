// Matches a selection's team names against Statarea's prediction list.
// Deliberately NOT sharing code with teamMatcher.ts (football-data.org's
// matcher) -- keeps this experimental module fully independent, so
// nothing here can affect the existing, working Confidence Engine path.

import type { StatareaPrediction } from './statarea';

function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(fc|cf|sc|afc|cfc|ca|ac|ud|cd|if|bk|fk|sd|srl|rc)\b/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function bigrams(s: string): Set<string> {
  const padded = ` ${s} `;
  const grams = new Set<string>();
  for (let i = 0; i < padded.length - 1; i++) grams.add(padded.slice(i, i + 2));
  return grams;
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const setA = bigrams(a);
  const setB = bigrams(b);
  let overlap = 0;
  Array.from(setA).forEach((g) => {
    if (setB.has(g)) overlap++;
  });
  return (2 * overlap) / (setA.size + setB.size);
}

const PER_TEAM_THRESHOLD = 0.55;

export function findStatareaMatch(
  homeTeam: string,
  awayTeam: string,
  kickoffDate: string | null, // YYYY-MM-DD
  predictions: StatareaPrediction[],
): StatareaPrediction | null {
  const targetHome = normalizeTeamName(homeTeam);
  const targetAway = normalizeTeamName(awayTeam);

  const candidates = kickoffDate ? predictions.filter((p) => p.date === kickoffDate) : predictions;

  let best: { prediction: StatareaPrediction; score: number } | null = null;

  for (const p of candidates) {
    const homeScore = similarity(targetHome, normalizeTeamName(p.homeTeam));
    const awayScore = similarity(targetAway, normalizeTeamName(p.awayTeam));
    if (homeScore < PER_TEAM_THRESHOLD || awayScore < PER_TEAM_THRESHOLD) continue;

    const combined = (homeScore + awayScore) / 2;
    if (!best || combined > best.score) best = { prediction: p, score: combined };
  }

  return best?.prediction ?? null;
}
