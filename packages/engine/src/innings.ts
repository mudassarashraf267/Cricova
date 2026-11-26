import { formatOvers } from './format';
import type {
  BallRecord, BatterOutEvent, BatterState, BowlerState, DeliveryEvent, DismissalKind, InningsConfig,
  InningsEvent, InningsState, Partnership, PenaltyEvent,
} from './types';

export class ScoringError extends Error {
  constructor(message: string) { super(message); this.name = 'ScoringError'; }
}

/** Dismissals credited to the bowler. Run-out, obstruction, hit-twice, timed-out, retired are NOT. */
const BOWLER_CREDIT = new Set<DismissalKind>(['bowled', 'caught', 'caughtAndBowled', 'lbw', 'stumped', 'hitWicket']);
/** Dismissals where the ball is dead / no runs can be scored. */
const NO_RUNS = new Set<DismissalKind>(['bowled', 'caught', 'caughtAndBowled', 'lbw', 'stumped', 'hitWicket']);
const STRIKER_ONLY = new Set<DismissalKind>(['bowled', 'caught', 'caughtAndBowled', 'lbw', 'stumped', 'hitWicket', 'hitBallTwice']);
const DELIVERY_KINDS = new Set<DismissalKind>([...BOWLER_CREDIT, 'runOut', 'hitBallTwice', 'obstructingField']);
/** Only these dismissals are possible off a no-ball or a free hit. */
const ON_NO_BALL = new Set<DismissalKind>(['runOut', 'hitBallTwice', 'obstructingField']);
const ON_WIDE = new Set<DismissalKind>(['runOut', 'stumped', 'hitWicket', 'obstructingField']);

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;

export function createInnings(config: InningsConfig): InningsState {
  const { rules, battingOrder } = config;
  if (new Set(battingOrder).size !== battingOrder.length) throw new ScoringError('Duplicate players in batting order');
  const openers = config.openers ?? [battingOrder[0], battingOrder[1]];
  if (!openers[0] || !openers[1] || openers[0] === openers[1]) throw new ScoringError('Two distinct openers required');
  for (const o of openers) if (!battingOrder.includes(o)) throw new ScoringError(`Opener ${o} not in batting order`);

  const batters: Record<string, BatterState> = {};
  for (const id of battingOrder) batters[id] = { id, runs: 0, balls: 0, fours: 0, sixes: 0, dots: 0, status: 'yetToBat' };
  batters[openers[0]].status = 'notOut'; batters[openers[0]].arrival = 1;
  batters[openers[1]].status = 'notOut'; batters[openers[1]].arrival = 2;

  const s: InningsState = {
    config, runs: 0, wickets: 0, legalBalls: 0,
    extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0 },
    batters, bowlers: {}, strikerId: openers[0], nonStrikerId: openers[1],
    currentOver: null, lastOverBowlerId: null, freeHit: false,
    balls: [], overs: [], fow: [], partnerships: [], current: null,
    status: 'inProgress', arrivals: 2,
    wicketsToEnd: Math.min(rules.playersPerSide, battingOrder.length) - 1,
    oversLimit: config.oversLimit !== undefined ? config.oversLimit : rules.oversPerInnings,
    appliedIds: [],
  };
  s.current = newPartnership(s, openers[0], openers[1]);
  return s;
}

function newPartnership(s: InningsState, a: string, b: string): Partnership {
  return {
    wicketNo: s.wickets + 1, batters: [a, b], runs: 0, balls: 0, extras: 0,
    contributions: {
      [a]: { runs: 0, balls: 0, fours: 0, sixes: 0 },
      [b]: { runs: 0, balls: 0, fours: 0, sixes: 0 },
    },
    startScore: s.runs, startLegalBalls: s.legalBalls, unbroken: true,
  };
}

function closePartnership(s: InningsState): number {
  const p = s.current!;
  p.endScore = s.runs; p.endLegalBalls = s.legalBalls; p.unbroken = false;
  s.partnerships.push(p);
  s.current = null;
  return p.runs;
}

function bowlerOf(s: InningsState, id: string): BowlerState {
  return (s.bowlers[id] ??= {
    id, legalBalls: 0, deliveries: 0, runs: 0, wickets: 0, maidens: 0, dots: 0,
    wides: 0, noBalls: 0, fours: 0, sixes: 0, boundaryRuns: 0,
  });
}

function swapStrike(s: InningsState) { [s.strikerId, s.nonStrikerId] = [s.nonStrikerId, s.strikerId]; }

function token(ev: DeliveryEvent, wk: boolean): string {
  const wides = ev.wides ?? 0, byes = ev.byes ?? 0, lb = ev.legByes ?? 0;
  let t: string;
  if (wides > 0) t = wides === 1 ? 'Wd' : `${wides}Wd`;
  else if (ev.noBall) t = ev.batRuns ? `Nb+${ev.batRuns}` : byes ? `Nb+${byes}b` : lb ? `Nb+${lb}lb` : 'Nb';
  else if (byes) t = `${byes}b`;
  else if (lb) t = `${lb}lb`;
  else t = String(ev.batRuns);
  return wk ? (t === '0' ? 'W' : `${t}W`) : t;
}

/** Placing an incoming batter: must be yet to bat, or returning from retired hurt / not out. */
function admitBatter(s: InningsState, id: string | undefined): BatterState {
  if (!id) throw new ScoringError('nextBatterId is required: the innings is not over');
  const b = s.batters[id];
  if (!b) throw new ScoringError(`Batter ${id} is not in the batting order`);
  if (b.status !== 'yetToBat' && b.status !== 'retiredHurt' && b.status !== 'retiredNotOut') {
    throw new ScoringError(`Batter ${id} cannot come in (status: ${b.status})`);
  }
  if (b.status === 'yetToBat') b.arrival = ++s.arrivals;
  b.status = 'notOut';
  if (b.dismissal) delete b.dismissal;
  return b;
}

function evaluateEnd(s: InningsState) {
  if (s.status !== 'inProgress') return;
  const { target } = s.config;
  if (target !== undefined && s.runs >= target) s.status = 'targetReached';
  else if (s.wickets >= s.wicketsToEnd) s.status = 'allOut';
  else if (s.oversLimit !== null && s.legalBalls >= s.oversLimit * s.config.rules.ballsPerOver) s.status = 'oversComplete';
}

function closeOver(s: InningsState) {
  const o = s.currentOver!;
  const bpo = s.config.rules.ballsPerOver;
  let maidenBowlerId: string | undefined;
  if (o.bowlerIds.length === 1 && o.legalBalls === bpo && o.chargedByBowler[o.bowlerId] === 0) {
    maidenBowlerId = o.bowlerId;
    bowlerOf(s, o.bowlerId).maidens++;
  }
  s.overs.push({
    over: o.index + 1, bowlerIds: [...o.bowlerIds], legalBalls: o.legalBalls, runs: o.runs,
    wickets: o.wickets, maidenBowlerId, tokens: [...o.tokens],
  });
  s.lastOverBowlerId = o.bowlerId;
  s.currentOver = null;
}

function fowOver(s: InningsState) { return formatOvers(s.legalBalls, s.config.rules.ballsPerOver); }

/** Pure: returns a new state, never mutates the input. Throws ScoringError (state untouched) on invalid input. */
export function applyEvent(prev: InningsState, ev: InningsEvent): InningsState {
  if (prev.status !== 'inProgress') throw new ScoringError(`Innings is complete (${prev.status})`);
  if (prev.appliedIds.includes(ev.id)) throw new ScoringError(`Duplicate event ${ev.id}`);
  const s = structuredClone(prev);
  switch (ev.type) {
    case 'delivery': applyDelivery(s, ev); break;
    case 'batterOut': applyBatterOut(s, ev); break;
    case 'penalty': applyPenalty(s, ev); break;
    case 'swapStrike':
      if (!s.strikerId || !s.nonStrikerId) throw new ScoringError('Two batters must be at the crease');
      swapStrike(s); break;
    case 'declare': s.status = 'declared'; if (s.current) { s.current.endScore = s.runs; } break;
    default: throw new ScoringError('Unknown event type');
  }
  s.appliedIds.push(ev.id);
  return s;
}

export function replay(config: InningsConfig, events: InningsEvent[]): InningsState {
  let s = createInnings(config);
  for (const e of events) s = applyEvent(s, e);
  return s;
}

function applyPenalty(s: InningsState, ev: PenaltyEvent) {
  if (!isInt(ev.runs) || ev.runs === 0) throw new ScoringError('Penalty runs must be a positive integer');
  s.extras.penalty += ev.runs; s.runs += ev.runs;
  if (s.current) { s.current.runs += ev.runs; s.current.extras += ev.runs; }
  evaluateEnd(s);
}

function applyBatterOut(s: InningsState, ev: BatterOutEvent) {
  if (s.strikerId !== ev.playerId && s.nonStrikerId !== ev.playerId) throw new ScoringError('Batter is not at the crease');
  const out = s.batters[ev.playerId];
  const isWicket = ev.kind === 'timedOut' || ev.kind === 'retiredOut';
  const outRef = out;
  if (isWicket) {
    s.wickets++;
    outRef.status = 'out';
    outRef.dismissal = { kind: ev.kind, wicketNo: s.wickets, score: s.runs, over: fowOver(s), ballId: ev.id };
  } else {
    outRef.status = ev.kind === 'retiredHurt' ? 'retiredHurt' : 'retiredNotOut';
    outRef.dismissal = { kind: ev.kind, score: s.runs, over: fowOver(s), ballId: ev.id };
  }
  const slot = s.strikerId === ev.playerId ? 'striker' : 'nonStriker';
  const survivor = slot === 'striker' ? s.nonStrikerId! : s.strikerId!;
  const pRuns = closePartnership(s);
  if (isWicket) {
    s.fow.push({ wicket: s.wickets, score: s.runs, batterId: ev.playerId, over: fowOver(s), legalBalls: s.legalBalls, partnershipRuns: pRuns, kind: ev.kind });
  }
  if (isWicket && s.wickets >= s.wicketsToEnd) {
    if (slot === 'striker') s.strikerId = null; else s.nonStrikerId = null;
    evaluateEnd(s);
    return;
  }
  const next = admitBatter(s, ev.nextBatterId);
  if (slot === 'striker') { s.strikerId = next.id; } else { s.nonStrikerId = next.id; }
  s.current = newPartnership(s, survivor, next.id);
}

function applyDelivery(s: InningsState, ev: DeliveryEvent) {
  const rules = s.config.rules;
  const bpo = rules.ballsPerOver;
  const wides = ev.wides ?? 0, byes = ev.byes ?? 0, legByes = ev.legByes ?? 0, bat = ev.batRuns;
  const noBall = !!ev.noBall;

  if (!ev.bowlerId) throw new ScoringError('bowlerId is required');
  if (![bat, wides, byes, legByes].every(isInt)) throw new ScoringError('Runs must be non-negative integers');
  if (!s.strikerId || !s.nonStrikerId) throw new ScoringError('Two batters must be at the crease');
  if (wides > 0 && (noBall || bat > 0 || byes > 0 || legByes > 0)) throw new ScoringError('A wide cannot be combined with no-ball, bat runs, byes or leg-byes');
  if (wides > 0 && wides < rules.wideRuns) throw new ScoringError(`A wide is worth at least ${rules.wideRuns}`);
  if (byes > 0 && legByes > 0) throw new ScoringError('Byes and leg-byes cannot both be scored off one ball');
  if (bat > 0 && (byes > 0 || legByes > 0)) throw new ScoringError('Bat runs cannot be combined with byes/leg-byes on one ball');

  if (ev.boundary) {
    const credited = bat > 0 ? bat : wides > 0 ? wides : byes + legByes;
    if (credited < ev.boundary) throw new ScoringError(`Boundary ${ev.boundary} requires at least ${ev.boundary} runs`);
  }
  const legal = wides === 0 && !noBall;
  const completed = ev.completedRuns ?? (ev.boundary ? 0 : wides > 0 ? wides - rules.wideRuns : bat + byes + legByes);
  if (!isInt(completed)) throw new ScoringError('completedRuns must be a non-negative integer');

  // --- wicket validation ---
  const freeHit = s.freeHit && rules.freeHit;
  const w = ev.wicket;
  let outId = '';
  if (w) {
    if (!DELIVERY_KINDS.has(w.kind)) throw new ScoringError(`${w.kind} is not a delivery dismissal; use a batterOut event`);
    outId = w.playerOutId ?? s.strikerId;
    if (outId !== s.strikerId && outId !== s.nonStrikerId) throw new ScoringError('Dismissed batter is not at the crease');
    if (STRIKER_ONLY.has(w.kind) && outId !== s.strikerId) throw new ScoringError(`${w.kind} can only dismiss the striker`);
    if ((noBall || freeHit) && !ON_NO_BALL.has(w.kind)) throw new ScoringError(`${w.kind} is not possible off a ${noBall ? 'no-ball' : 'free hit'}`);
    if (wides > 0 && !ON_WIDE.has(w.kind)) throw new ScoringError(`${w.kind} is not possible off a wide`);
    if (NO_RUNS.has(w.kind) && (bat > 0 || byes > 0 || legByes > 0 || completed > 0)) throw new ScoringError(`No runs can be scored when ${w.kind} (the ball is dead)`);
  }

  // --- bowler validation ---
  const o0 = s.currentOver;
  if (!o0) {
    if (ev.replacesBowlerMidOver) throw new ScoringError('No over is in progress to replace a bowler in');
    if (!rules.allowConsecutiveOvers && s.lastOverBowlerId === ev.bowlerId) throw new ScoringError('A bowler cannot bowl consecutive overs');
  } else if (o0.bowlerId !== ev.bowlerId) {
    if (!ev.replacesBowlerMidOver) throw new ScoringError('Bowler changed mid-over: set replacesBowlerMidOver');
    if (o0.bowlerIds.includes(ev.bowlerId)) throw new ScoringError('A bowler who left the over cannot resume it');
    if (!rules.allowConsecutiveOvers && s.lastOverBowlerId === ev.bowlerId) throw new ScoringError('A bowler cannot bowl consecutive overs');
  }
  const max = rules.maxOversPerBowler;
  if (max !== null && (s.bowlers[ev.bowlerId]?.legalBalls ?? 0) >= max * bpo) throw new ScoringError(`Bowler has bowled the maximum ${max} overs`);

  // Next-batter requirement is checked before any mutation of the clone matters (clone is discarded on throw anyway).
  // --- apply ---
  const bowler = bowlerOf(s, ev.bowlerId);
  if (!s.currentOver) {
    s.currentOver = { index: s.overs.length, bowlerId: ev.bowlerId, bowlerIds: [ev.bowlerId], legalBalls: 0, runs: 0, wickets: 0, chargedByBowler: { [ev.bowlerId]: 0 }, tokens: [] };
  } else if (s.currentOver.bowlerId !== ev.bowlerId) {
    s.currentOver.bowlerId = ev.bowlerId; s.currentOver.bowlerIds.push(ev.bowlerId); s.currentOver.chargedByBowler[ev.bowlerId] ??= 0;
  }
  const over = s.currentOver!;
  const strikerId = s.strikerId, nonStrikerId = s.nonStrikerId;
  const striker = s.batters[strikerId];

  const nbRuns = noBall ? rules.noBallRuns : 0;
  const extraRuns = wides + nbRuns + byes + legByes;
  const total = bat + extraRuns;
  const charged = bat + wides + nbRuns;

  // batter
  if (wides === 0) {
    striker.balls++;
    if (!noBall && bat === 0) striker.dots++;
  }
  striker.runs += bat;
  const batBoundary = ev.boundary && bat > 0 ? ev.boundary : undefined;
  if (batBoundary === 4) striker.fours++;
  if (batBoundary === 6) striker.sixes++;

  // team
  s.runs += total;
  s.extras.wides += wides; if (noBall) s.extras.noBalls += nbRuns;
  s.extras.byes += byes; s.extras.legByes += legByes;

  // bowler
  bowler.deliveries++; bowler.runs += charged; bowler.wides += wides;
  if (noBall) bowler.noBalls++;
  if (legal) { bowler.legalBalls++; if (bat === 0) bowler.dots++; }
  if (batBoundary) { bowler.boundaryRuns += bat; if (batBoundary === 4) bowler.fours++; else bowler.sixes++; }
  over.runs += total; over.chargedByBowler[ev.bowlerId] += charged;

  // partnership
  const p = s.current!;
  p.runs += total; p.extras += extraRuns;
  if (legal) p.balls++;
  const c = p.contributions[strikerId];
  c.runs += bat; if (wides === 0) c.balls++;
  if (batBoundary === 4) c.fours++; if (batBoundary === 6) c.sixes++;

  // strike rotation from runs physically run
  if (completed % 2 === 1) swapStrike(s);

  // legal ball count (before wicket so FOW over string is right)
  if (legal) { s.legalBalls++; over.legalBalls++; }

  // wicket
  let wicketNo = 0;
  if (w) {
    const credited = BOWLER_CREDIT.has(w.kind);
    s.wickets++; wicketNo = s.wickets;
    over.wickets++;
    const out = s.batters[outId];
    out.status = 'out';
    out.dismissal = {
      kind: w.kind, bowlerId: credited ? ev.bowlerId : undefined,
      fielderId: w.kind === 'caughtAndBowled' ? ev.bowlerId : w.fielderId,
      wicketNo, score: s.runs, over: fowOver(s), ballId: ev.id,
    };
    if (credited) bowler.wickets++;
    const slot = s.strikerId === outId ? 'striker' : 'nonStriker';
    const survivor = slot === 'striker' ? s.nonStrikerId! : s.strikerId!;
    const pRuns = closePartnership(s);
    s.fow.push({ wicket: wicketNo, score: s.runs, batterId: outId, over: fowOver(s), legalBalls: s.legalBalls, partnershipRuns: pRuns, kind: w.kind });
    if (s.wickets >= s.wicketsToEnd) {
      if (slot === 'striker') s.strikerId = null; else s.nonStrikerId = null;
    } else {
      const next = admitBatter(s, w.nextBatterId);
      const end = w.newBatterEnd ?? slot;
      if (end === 'striker') { s.strikerId = next.id; s.nonStrikerId = survivor; } else { s.strikerId = survivor; s.nonStrikerId = next.id; }
      s.current = newPartnership(s, survivor, next.id);
    }
  }

  const tok = token(ev, !!w);
  over.tokens.push(tok);

  // end of over: close the over and change ends
  if (legal && over.legalBalls === bpo) {
    closeOver(s);
    if (s.strikerId && s.nonStrikerId) swapStrike(s);
  }

  // free hit tracking: a no-ball earns a free hit; wides do not use it up; any legal ball does
  if (rules.freeHit) { if (noBall) s.freeHit = true; else if (legal) s.freeHit = false; }

  const rec: BallRecord = {
    seq: s.balls.length + 1, id: ev.id, over: over.index, legalInOver: over.legalBalls,
    strikerId, nonStrikerId, bowlerId: ev.bowlerId,
    batRuns: bat, wides, noBall, byes, legByes, extraRuns, totalRuns: total, chargedToBowler: charged,
    legal, completedRuns: completed, boundary: ev.boundary,
    wicket: w ? { kind: w.kind, playerOutId: outId, fielderId: w.kind === 'caughtAndBowled' ? ev.bowlerId : w.fielderId, bowlerCredited: BOWLER_CREDIT.has(w.kind), wicketNo } : undefined,
    freeHit,
    token: tok, at: ev.at, scorerId: ev.scorerId,
    scoreAfter: s.runs, wicketsAfter: s.wickets, legalBallsAfter: s.legalBalls,
  };
  s.balls.push(rec);
  evaluateEnd(s);
}
