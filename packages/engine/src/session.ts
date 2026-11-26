import { applyEvent, createInnings, replay, ScoringError } from './innings';
import type { InningsConfig, InningsEvent, InningsState } from './types';

export interface AuditEntry {
  id: number;
  action: 'add' | 'undo' | 'redo' | 'edit' | 'delete';
  at: string;
  userId: string;
  reason?: string;
  original?: InningsEvent;
  corrected?: InningsEvent;
}

export interface AddResult { added: boolean; duplicate: boolean }

/**
 * Event-sourced scoring session for one innings. The state is always a pure function of the active event list.
 * Corrections never silently overwrite: every undo/edit/delete records the original, the correction, a reason, time and user.
 */
export class ScoringSession {
  private _events: InningsEvent[];
  private redoStack: InningsEvent[] = [];
  private _audit: AuditEntry[] = [];
  private _state: InningsState;

  constructor(private config: InningsConfig, events: InningsEvent[] = [], private now: () => string = () => new Date().toISOString()) {
    this._state = replay(config, events);
    this._events = [...events];
  }

  get state(): InningsState { return this._state; }
  get events(): readonly InningsEvent[] { return this._events; }
  get audit(): readonly AuditEntry[] { return this._audit; }
  get canUndo() { return this._events.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }

  private log(action: AuditEntry['action'], userId: string, extra: Partial<AuditEntry> = {}) {
    this._audit.push({ id: this._audit.length + 1, action, at: this.now(), userId, ...extra });
  }

  /** Idempotent: re-adding an event with a known id is a no-op (safe for offline sync retries). */
  add(ev: InningsEvent, userId = 'system'): AddResult {
    if (this._events.some((e) => e.id === ev.id)) return { added: false, duplicate: true };
    this._state = applyEvent(this._state, ev); // throws before any mutation if invalid
    this._events.push(ev);
    this.redoStack = [];
    this.log('add', userId, { corrected: ev });
    return { added: true, duplicate: false };
  }

  undo(userId: string, reason = 'undo'): InningsEvent {
    const last = this._events[this._events.length - 1];
    if (!last) throw new ScoringError('Nothing to undo');
    this._events.pop();
    this._state = replay(this.config, this._events);
    this.redoStack.push(last);
    this.log('undo', userId, { reason, original: last });
    return last;
  }

  redo(userId: string): InningsEvent {
    const ev = this.redoStack.pop();
    if (!ev) throw new ScoringError('Nothing to redo');
    try { this._state = applyEvent(this._state, ev); } catch (e) { this.redoStack.push(ev); throw e; }
    this._events.push(ev);
    this.log('redo', userId, { corrected: ev });
    return ev;
  }

  /** Replace an earlier event. Everything after it is replayed; if any later event becomes invalid the edit is rejected. */
  edit(eventId: string, replacement: InningsEvent, userId: string, reason: string): void {
    if (!reason) throw new ScoringError('A reason is required for corrections');
    const i = this._events.findIndex((e) => e.id === eventId);
    if (i < 0) throw new ScoringError(`Unknown event ${eventId}`);
    const next = [...this._events]; const original = next[i]; next[i] = replacement;
    const state = replay(this.config, next); // throws if the correction breaks later events
    this._events = next; this._state = state; this.redoStack = [];
    this.log('edit', userId, { reason, original, corrected: replacement });
  }

  remove(eventId: string, userId: string, reason: string): void {
    if (!reason) throw new ScoringError('A reason is required for deletions');
    const i = this._events.findIndex((e) => e.id === eventId);
    if (i < 0) throw new ScoringError(`Unknown event ${eventId}`);
    const next = this._events.filter((_, k) => k !== i);
    const state = replay(this.config, next);
    const original = this._events[i];
    this._events = next; this._state = state; this.redoStack = [];
    this.log('delete', userId, { reason, original });
  }

  /** Rebuild from scratch; used to prove scorecards are derivable purely from history. */
  recalculate(): InningsState { this._state = replay(this.config, this._events); return this._state; }
}

export { createInnings };
