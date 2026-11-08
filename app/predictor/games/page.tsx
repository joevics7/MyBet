import { Metadata } from 'next';
import { ToolPageShell } from '@/components/tools/ToolPageShell';
import { PredictorGames, type GameRow } from '@/components/tools/PredictorGames';
import { supabase } from '@/lib/supabase';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Predictor: all games',
  description: "The day's analysed games with a suggested bet and confidence. Pick several and create a booking code.",
};

export default async function Page() {
  const todayDate = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  let rows: GameRow[] | null = null;
  if (supabase) {
    const { data } = await supabase
      .from('predictor_games')
      .select('id,game_date,home_team,away_team,competition,kickoff_at,market,confidence,odds,result,final_score')
      .gte('game_date', since)
      .order('confidence', { ascending: false });
    rows = (data as GameRow[] | null) ?? [];
  }
  return (
    <ToolPageShell
      title="Predictor: all games"
      tagline="Every game analysed today, with the suggested bet and a confidence level. Pick several and create one booking code."
      status="live"
      howItWorks={
        <p>
          Each morning the Predictor analyses the day&rsquo;s best-covered games and picks the most confident bet for each. Tap the games
          you want, choose a platform and create a booking code. Confidence is the Confidence Engine&rsquo;s 0&ndash;100 score (High is 85
          or more). After a game finishes, its bet is marked won or lost from the final score, and the last 3 days are kept under
          &ldquo;Last 3 days&rdquo;. Statistical analysis, not a guarantee.
        </p>
      }
      body={
        rows === null ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">Not connected yet.</div>
        ) : (
          <PredictorGames todayDate={todayDate} today={rows.filter((g) => g.game_date === todayDate)} history={rows} />
        )
      }
    />
  );
}
