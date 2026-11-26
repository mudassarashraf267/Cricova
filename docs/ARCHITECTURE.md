# Cricova: architecture and roadmap

## Layout
```
packages/engine   pure TypeScript scoring engine (no DOM, no Node APIs, no framework). DONE (core)
apps/api          Fastify + SQLite REST API, accounts/roles, SSE live updates, engine-validated events (Postgres/Prisma still to do)
apps/web          React + Vite + Tailwind + Framer Motion + Recharts (Phase 1/3, not started)
apps/desktop      Tauri shell around apps/web                        (Phase 5)
apps/mobile       Capacitor shell around apps/web                    (Phase 5)
```
The engine is shared by every platform and by the server. The server re-validates events with the same engine, so a client cannot store a score the rules would reject.

## Scoring engine design
- **Event sourcing.** An innings is `replay(config, events)`. State is never edited in place. `applyEvent` is pure: it clones the state and throws `ScoringError` before anything changes if the event is invalid.
- **Delivery model.** One `DeliveryEvent` carries bat runs, `wides` (total, including the penalty run), `noBall`, `byes`, `legByes`, `boundary`, `completedRuns` and an optional `wicket`. Combinations such as no-ball + 4, wide + 2 run, no-ball + byes, and run-out + bye are fields on one event, not separate events. Impossible combinations are rejected.
- **Overs** are stored as integer legal balls. `formatOvers(34) === "5.4"`.
- **Strike** is derived from `completedRuns` parity (set it explicitly for overthrows), then the incoming-batter placement, then the end-of-over change of ends.
- **Rule profiles.** `RuleProfile` (T20, ODI, T10, Test, tape-ball, `customRules`) controls balls per over, overs, bowler limits, side size, penalty runs, free hit and consecutive overs.
- **Non-delivery events.** `batterOut` (timed out, retired out/hurt/not out), `penalty` and `declare`.
- **Corrections.** `ScoringSession` provides idempotent `add` (dedupes by event id, which is the base for offline sync), `undo`/`redo`, `edit` and `remove`. Edit and remove replay the whole log and are rejected if a later event would become illegal. Each change is audited with the original, the correction, a reason, a time and a user.
- **Derived outputs.** Batting and bowling cards, extras, fall of wickets, partnerships, over summaries, `scoreboard()` (CRR, target, required, RRR, last six) and `checkInvariants()`.
- `computeResult` covers win by runs, wickets or innings, tie, draw, no result and abandoned. It returns `incomplete` instead of guessing.

## Assumptions (rules decisions)
1. A caught, bowled, LBW, stumped or hit-wicket dismissal scores no runs (the ball is dead). The engine rejects runs on those balls.
2. Off a no-ball or free hit only run-out, hit-the-ball-twice and obstruction are allowed. Off a wide: run-out, stumped, hit-wicket and obstruction.
3. Bowler credit goes to bowled, caught, caught-and-bowled, LBW, stumped and hit-wicket only. Run-out, obstruction, hit-twice, timed-out and retired are never credited to the bowler.
4. Batter balls faced: every delivery except a wide, so no-balls, byes and leg-byes count. Dot balls follow the same rule.
5. A maiden means one bowler bowled the whole over of 6 legal balls with no bat runs, wides or no-balls. Byes and leg-byes do not spoil it. If the bowler changes mid-over, nobody gets a maiden.
6. After a run-out the incoming batter takes the dismissed batter's position, taken after the completed runs rotate strike. `newBatterEnd` overrides this for the crossed-batters edge case.
7. FOW over is the legal-ball count at the moment of the wicket (e.g. `4.2`).
8. Penalty runs count to the team total and the current partnership, not to a batter or bowler.
9. **DLS is not implemented.** An official method must be integrated. Until then a revised target can be passed into `InningsConfig.target` and `oversLimit`, but nothing is computed.

## Data model (Prisma, Phase 1)
Users, Players, Teams, TeamPlayers (dated membership, so history survives transfers), Tournaments, TournamentTeams, Fixtures, Matches, MatchTeams, PlayingElevens, MatchOfficials, Innings, MatchEvents (append-only event log: id, innings, seq, type, JSON payload, device, created_at, voided_by), Deliveries / BattingPerformances / BowlingPerformances / Dismissals / Partnerships / FallOfWickets / OverSummaries (projections rebuilt from MatchEvents in one transaction), Commentary, ScoringRules (the RuleProfile JSON), AuditLogs. Career stats are aggregated from projections of completed matches only, keyed by (match, innings, player), which prevents double counting.

## Roadmap
| Phase | Scope | Status |
|---|---|---|
| 2 | Scoring engine, dismissals, strike/overs, unit tests | Core done (this commit) |
| 1 | Monorepo, API, auth/RBAC (admin/scorer/viewer), dashboard, players, teams | Done, on SQLite instead of Prisma/Postgres |
| 3 | Match wizard, toss, XI, live scoring UI, scorecards, commentary, results | Not started |
| 4 | Career stats, analytics, comparison, tournaments, PDF/CSV | Not started |
| 5 | PWA, offline queue and server sync (last-write-wins per document), Capacitor, Tauri | Sync done; conflict detection and packaging not started |
| 6 | QA: performance, security, accessibility | Not started |

## Not yet in the engine
Multiple wickets on a single ball, penalty-run side effects on strike, concussion or substitute fielder tracking, super-over orchestration across innings (single innings works), follow-on enforcement, Test day/session tracking, auto-commentary, and cross-device conflict resolution (only idempotent append exists).
