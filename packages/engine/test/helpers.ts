import { applyEvent, createInnings, customRules, T20 } from '../src';
import type { DeliveryEvent, InningsConfig, InningsEvent, InningsState, RuleProfile } from '../src';

let n = 0;
export const d = (o: Partial<DeliveryEvent> = {}): DeliveryEvent => ({ type: 'delivery', id: `e${++n}`, bowlerId: 'B1', batRuns: 0, ...o });
export const order = Array.from({ length: 11 }, (_, i) => `A${i + 1}`);

export const mk = (rules: RuleProfile = T20, extra: Partial<InningsConfig> = {}): InningsState =>
  createInnings({ rules, battingOrder: order, ...extra });

export const run = (s: InningsState, ...evs: InningsEvent[]): InningsState => evs.reduce((st, e) => applyEvent(st, e), s);

/** Bowl a full over with the given bat runs per ball (6 legal balls). */
export const over = (s: InningsState, bowlerId: string, runs: number[] = [0, 0, 0, 0, 0, 0]): InningsState =>
  run(s, ...runs.map((r) => d({ bowlerId, batRuns: r, boundary: r === 4 ? 4 : r === 6 ? 6 : undefined })));

export const rules = (o: Parameters<typeof customRules>[0]) => customRules(o);
