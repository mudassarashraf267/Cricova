const r2 = (n: number) => Math.round(n * 100) / 100;

/** SR = runs / balls * 100. null when no balls faced. */
export const strikeRate = (runs: number, balls: number) => (balls > 0 ? r2((runs / balls) * 100) : null);
/** Average = runs / dismissals. null when never dismissed. */
export const battingAverage = (runs: number, dismissals: number) => (dismissals > 0 ? r2(runs / dismissals) : null);
/** Economy / run rate = runs / (legalBalls / ballsPerOver). */
export const economy = (runs: number, legalBalls: number, bpo = 6) => (legalBalls > 0 ? r2((runs * bpo) / legalBalls) : null);
export const bowlingAverage = (runs: number, wickets: number) => (wickets > 0 ? r2(runs / wickets) : null);
export const bowlingStrikeRate = (legalBalls: number, wickets: number) => (wickets > 0 ? r2(legalBalls / wickets) : null);
