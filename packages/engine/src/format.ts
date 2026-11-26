/** Overs are NEVER decimal arithmetic. Store legal balls (integer); derive the display. */
export function formatOvers(legalBalls: number, ballsPerOver = 6): string {
  return `${Math.floor(legalBalls / ballsPerOver)}.${legalBalls % ballsPerOver}`;
}

/** "5.4" -> 34 legal balls. Rejects "5.6" (not a valid over count). */
export function ballsFromOvers(text: string, ballsPerOver = 6): number {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (!m) throw new Error(`Invalid overs: ${text}`);
  const balls = m[2] === undefined ? 0 : Number(m[2]);
  if (balls >= ballsPerOver) throw new Error(`Invalid overs: ${text} (max .${ballsPerOver - 1})`);
  return Number(m[1]) * ballsPerOver + balls;
}
