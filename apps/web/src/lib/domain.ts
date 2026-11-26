import type { InningsConfig, InningsEvent, InningsState, RuleProfile } from '@cricketpro/engine';
import { replay } from '@cricketpro/engine';

export type Role = 'Batter' | 'Bowler' | 'All-rounder' | 'Wicketkeeper';
export const BAT_STYLES = ['Right-handed', 'Left-handed'] as const;
export const BOWL_STYLES = ['None', 'Right-arm fast', 'Left-arm fast', 'Right-arm medium', 'Left-arm medium', 'Right-arm off-spin', 'Left-arm orthodox', 'Left-arm wrist spin', 'Right-arm leg-spin', 'Other'] as const;

export interface Player {
  id: string; name: string; nickname?: string; dob?: string; nationality?: string; photo?: string;
  batStyle: string; bowlStyle: string; role: Role; jersey?: number; teamId?: string; notes?: string;
}
export interface Team {
  id: string; name: string; logo?: string; region?: string; ground?: string; coach?: string; description?: string;
  playerIds: string[]; captainId?: string; viceId?: string; keeperId?: string; color: string;
}
export interface AuditRow { at: string; action: string; reason?: string; user: string; detail: string }
export interface MatchInnings {
  battingTeamId: string; bowlingTeamId: string;
  openers: [string, string];
  events: InningsEvent[]; redo: InningsEvent[]; audit: AuditRow[];
  oversLimit?: number | null; target?: number;
  /** Quick-entry scores (Mode B). Marked manual: never mixed with ball-by-ball data. */
  manual?: ManualInnings;
}
export interface ManualInnings {
  runs: number; wickets: number; overs: string; extras: number;
  batters: { name: string; runs: number; balls: number; out: boolean }[];
  bowlers: { name: string; overs: string; runs: number; wickets: number }[];
}
export interface Match {
  id: string; title: string; teamAId: string; teamBId: string; tournamentId?: string;
  date: string; time?: string; venue: string; pitch: string; umpires: string; scorer: string;
  format: string; rules: RuleProfile;
  xi: Record<string, string[]>;
  toss?: { winnerId: string; decision: 'bat' | 'bowl' };
  innings: MatchInnings[];
  status: 'upcoming' | 'live' | 'completed';
  override?: 'noResult' | 'abandoned' | 'drawn';
  potmId?: string; mode: 'detailed' | 'quick';
  stage?: string;
}
export interface Fixture { id: string; teamAId: string; teamBId: string; date: string; stage: 'league' | 'quarter' | 'semi' | 'final'; matchId?: string }
export interface Tournament { id: string; name: string; teamIds: string[]; fixtures: Fixture[]; rules?: Partial<RuleProfile>; createdAt: string }
export interface Settings { dark: boolean; sound: boolean; vibrate: boolean; scorer: string }
export interface DB { archived?: Record<string, string>; players: Player[]; teams: Team[]; matches: Match[]; tournaments: Tournament[]; settings: Settings }

export const uid = (p = 'x') => `${p}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;

/** Total innings required for a match. */
export const totalInnings = (m: Match) => m.rules.inningsPerTeam * 2;

export function inningsConfig(m: Match, i: number): InningsConfig {
  const inn = m.innings[i];
  const order = orderFor(m, inn.battingTeamId, inn.openers);
  return { rules: m.rules, battingOrder: order, openers: inn.openers, target: inn.target, oversLimit: inn.oversLimit };
}
export function orderFor(m: Match, teamId: string, openers: [string, string]) {
  const xi = m.xi[teamId] ?? [];
  return [...openers, ...xi.filter((p) => !openers.includes(p))];
}

const cache = new WeakMap<object, InningsState>();
/** Derived state of an innings (memoised on the events array identity). */
export function inningsState(m: Match, i: number): InningsState {
  const inn = m.innings[i];
  const cfg = inningsConfig(m, i);
  const hit = cache.get(inn.events);
  if (hit && hit.config.target === cfg.target && hit.config.oversLimit === cfg.oversLimit && hit.config.battingOrder.length === cfg.battingOrder.length && hit.config.rules === cfg.rules) return hit;
  const s = replay(cfg, inn.events);
  cache.set(inn.events, s);
  return s;
}
