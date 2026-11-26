import type { RuleProfile } from './types';

const base: Omit<RuleProfile, 'id' | 'name'> = {
  ballsPerOver: 6, oversPerInnings: 20, maxOversPerBowler: 4, playersPerSide: 11, inningsPerTeam: 1,
  wideRuns: 1, noBallRuns: 1, freeHit: true, allowConsecutiveOvers: false, powerplays: [],
};

export const T20: RuleProfile = { ...base, id: 't20', name: 'T20', powerplays: [{ label: 'Powerplay', fromOver: 1, toOver: 6 }] };
export const ODI: RuleProfile = { ...base, id: 'odi', name: 'ODI', oversPerInnings: 50, maxOversPerBowler: 10, powerplays: [{ label: 'Powerplay 1', fromOver: 1, toOver: 10 }] };
export const T10: RuleProfile = { ...base, id: 't10', name: 'T10', oversPerInnings: 10, maxOversPerBowler: 2, powerplays: [{ label: 'Powerplay', fromOver: 1, toOver: 3 }] };
export const TEST: RuleProfile = { ...base, id: 'test', name: 'Test', oversPerInnings: null, maxOversPerBowler: null, inningsPerTeam: 2, freeHit: false };
export const TAPE_BALL: RuleProfile = { ...base, id: 'tape', name: 'Tape-ball', oversPerInnings: 6, maxOversPerBowler: 2, playersPerSide: 8 };

/** Build a custom profile from any preset. */
export function customRules(overrides: Partial<RuleProfile>, from: RuleProfile = T20): RuleProfile {
  return { ...from, id: 'custom', name: 'Custom', ...overrides };
}
