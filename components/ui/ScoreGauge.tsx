interface ScoreGaugeProps {
  score: number | null | undefined;
  size?: number;
  label?: string;
}

export function scoreTone(score: number | null | undefined): 'safe' | 'medium' | 'risky' | 'none' {
  if (score === null || score === undefined) return 'none';
  if (score >= 70) return 'safe';
  if (score >= 40) return 'medium';
  return 'risky';
}

const STROKE: Record<string, string> = {
  safe: 'stroke-safe',
  medium: 'stroke-medium',
  risky: 'stroke-risky',
  none: 'stroke-muted-foreground',
};
const TEXT: Record<string, string> = {
  safe: 'text-safe',
  medium: 'text-medium',
  risky: 'text-risky',
  none: 'text-muted-foreground',
};

/** Round confidence meter: a 270-degree arc that fills with the score. */
export function ScoreGauge({ score, size = 44, label }: ScoreGaugeProps) {
  const tone = scoreTone(score);
  const value = Math.max(0, Math.min(100, score ?? 0));
  const r = 18;
  const circ = 2 * Math.PI * r;
  const arc = circ * 0.75;
  const filled = (arc * value) / 100;

  return (
    <div
      className="relative inline-grid place-items-center shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={score == null ? 'No score' : `Score ${value}${label ? `, ${label}` : ''}`}
    >
      <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-[225deg]">
        <circle cx="22" cy="22" r={r} fill="none" strokeWidth="4" strokeLinecap="round"
          className="stroke-border" strokeDasharray={`${arc} ${circ}`} />
        {score != null && (
          <circle cx="22" cy="22" r={r} fill="none" strokeWidth="4" strokeLinecap="round"
            className={`gauge-arc ${STROKE[tone]}`}
            style={{ ['--gauge-full' as string]: `${arc}` }}
            strokeDasharray={`${filled} ${circ}`} />
        )}
      </svg>
      <span className={`relative font-mono font-semibold ${TEXT[tone]}`} style={{ fontSize: size * 0.3 }}>
        {score == null ? '–' : value}
      </span>
    </div>
  );
}
