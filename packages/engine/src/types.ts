/** Core types for the CricketPro scoring engine. Pure data, no platform dependencies. */

export type DismissalKind =
  | 'bowled' | 'caught' | 'caughtAndBowled' | 'lbw' | 'runOut' | 'stumped'
  | 'hitWicket' | 'hitBallTwice' | 'obstructingField' | 'timedOut'
  | 'retiredOut' | 'retiredHurt' | 'retiredNotOut';

export interface Powerplay { label: string; fromOver: number; toOver: number } // 1-based inclusive

/** Configurable rule profile: nothing in the engine hard-codes one competition's rules. */
export interface RuleProfile {
  id: string;
  name: string;
  ballsPerOver: number;
  /** null = unlimited (Test / first-class). */
  oversPerInnings: number | null;
  maxOversPerBowler: number | null;
  playersPerSide: number;
  inningsPerTeam: 1 | 2;
  /** Penalty runs added for a wide / no-ball (on top of any runs run). */
  wideRuns: number;
  noBallRuns: number;
  freeHit: boolean;
  allowConsecutiveOvers: boolean;
  powerplays: Powerplay[];
}

// ---------- Events (the immutable event log) ----------

export interface WicketInput {
  kind: DismissalKind;
  /** Defaults to the striker. Run-outs / obstruction may name the non-striker. */
  playerOutId?: string;
  fielderId?: string;
  /** Required unless the innings ends with this wicket. */
  nextBatterId?: string;
  /** Override which end the incoming batter takes (run-out edge cases). */
  newBatterEnd?: 'striker' | 'nonStriker';
}

export interface DeliveryEvent {
  type: 'delivery';
  id: string;
  bowlerId: string;
  /** Runs credited to the batter (includes boundary runs and bat-overthrows). */
  batRuns: number;
  /** 4 or 6 when the ball itself reached the boundary. Counts as the batter's four/six only if batRuns>0. */
  boundary?: 4 | 6;
  /** TOTAL wide runs including the penalty run. 5 = wide that ran to the boundary. */
  wides?: number;
  noBall?: boolean;
  byes?: number;
  legByes?: number;
  /** Runs physically run (drives strike rotation). Derived when omitted; set for overthrows. */
  completedRuns?: number;
  /** Original bowler could not complete the over; this bowler finishes it. */
  replacesBowlerMidOver?: boolean;
  wicket?: WicketInput;
  at?: string;
  scorerId?: string;
}

/** Dismissal/retirement not attached to a delivery (timed out, retired*). */
export interface BatterOutEvent {
  type: 'batterOut';
  id: string;
  kind: 'timedOut' | 'retiredOut' | 'retiredHurt' | 'retiredNotOut';
  playerId: string;
  nextBatterId?: string;
  at?: string;
  scorerId?: string;
}
export interface PenaltyEvent { type: 'penalty'; id: string; runs: number; at?: string; scorerId?: string }
export interface DeclareEvent { type: 'declare'; id: string; at?: string; scorerId?: string }
/** Scorer override: the batters did not end up where the runs implied (short run, did not cross, etc.). */
export interface SwapStrikeEvent { type: 'swapStrike'; id: string; at?: string; scorerId?: string }
export type InningsEvent = DeliveryEvent | BatterOutEvent | PenaltyEvent | DeclareEvent | SwapStrikeEvent;

// ---------- Derived state ----------

export interface InningsConfig {
  rules: RuleProfile;
  battingOrder: string[];
  openers?: [string, string];
  /** Runs needed to win (first-innings total + 1) when chasing. */
  target?: number;
  /** Override overs limit (e.g. reduced-overs match). null = unlimited. */
  oversLimit?: number | null;
}

export interface DismissalInfo {
  kind: DismissalKind;
  bowlerId?: string;
  fielderId?: string;
  wicketNo?: number;
  score: number;
  over: string;
  ballId?: string;
}

export type BatterStatus = 'yetToBat' | 'notOut' | 'out' | 'retiredHurt' | 'retiredNotOut';

export interface BatterState {
  id: string; runs: number; balls: number; fours: number; sixes: number; dots: number;
  status: BatterStatus; dismissal?: DismissalInfo; arrival?: number;
}

export interface BowlerState {
  id: string;
  legalBalls: number;
  /** Every delivery incl. wides and no-balls. */
  deliveries: number;
  /** Runs charged to the bowler (bat runs + wides + no-ball penalty). Never byes/leg-byes. */
  runs: number;
  wickets: number; maidens: number; dots: number;
  /** Wide runs conceded. */
  wides: number;
  /** Number of no-balls. */
  noBalls: number;
  fours: number; sixes: number; boundaryRuns: number;
}

export interface Extras { wides: number; noBalls: number; byes: number; legByes: number; penalty: number }

export interface BallRecord {
  seq: number; id: string;
  /** 0-based over index. */
  over: number;
  /** Legal balls completed in the over after this delivery. */
  legalInOver: number;
  strikerId: string; nonStrikerId: string; bowlerId: string;
  batRuns: number; wides: number; noBall: boolean; byes: number; legByes: number;
  extraRuns: number; totalRuns: number; chargedToBowler: number;
  legal: boolean; completedRuns: number; boundary?: 4 | 6;
  wicket?: { kind: DismissalKind; playerOutId: string; fielderId?: string; bowlerCredited: boolean; wicketNo: number };
  freeHit: boolean;
  token: string; at?: string; scorerId?: string;
  scoreAfter: number; wicketsAfter: number; legalBallsAfter: number;
}

export interface FallOfWicket {
  wicket: number; score: number; batterId: string; over: string; legalBalls: number;
  partnershipRuns: number; kind: DismissalKind;
}

export interface PartnershipContribution { runs: number; balls: number; fours: number; sixes: number }
export interface Partnership {
  /** 1-based partnership index (wickets at start + 1). */
  wicketNo: number;
  batters: [string, string];
  runs: number; balls: number; extras: number;
  contributions: Record<string, PartnershipContribution>;
  startScore: number; endScore?: number; startLegalBalls: number; endLegalBalls?: number;
  unbroken: boolean;
}

export interface OverSummary {
  over: number; bowlerIds: string[]; legalBalls: number; runs: number; wickets: number;
  maidenBowlerId?: string; tokens: string[];
}

export interface CurrentOver {
  index: number; bowlerId: string; bowlerIds: string[]; legalBalls: number;
  runs: number; wickets: number; chargedByBowler: Record<string, number>;
  tokens: string[];
}

export type InningsStatus = 'inProgress' | 'allOut' | 'oversComplete' | 'targetReached' | 'declared';

export interface InningsState {
  config: InningsConfig;
  runs: number; wickets: number; legalBalls: number;
  extras: Extras;
  batters: Record<string, BatterState>;
  bowlers: Record<string, BowlerState>;
  strikerId: string | null; nonStrikerId: string | null;
  currentOver: CurrentOver | null;
  lastOverBowlerId: string | null;
  freeHit: boolean;
  balls: BallRecord[];
  overs: OverSummary[];
  fow: FallOfWicket[];
  partnerships: Partnership[];
  current: Partnership | null;
  status: InningsStatus;
  arrivals: number;
  wicketsToEnd: number;
  oversLimit: number | null;
  appliedIds: string[];
}
