import { describe, expect, it } from 'vitest';
import { careerStats, inningsViews, nameMap, playerName, resultOf, teamName } from './analysis';
import { deleteAllPlayers, deleteAllStats, deleteAllTeams, deleteTeam, getDB, resetToSample } from './store';
import { matchCSV } from './text';

describe('delete all players / teams', () => {
  it('deleting all players empties squads but keeps matches, names and results', () => {
    resetToSample();
    const before = getDB();
    const m = before.matches.find((x) => x.status === 'completed')!;
    const resultBefore = resultOf(m, nameMap(before)).text;
    const someone = m.xi[m.teamAId][0];
    const nameBefore = playerName(before, someone);
    expect(before.players.length).toBeGreaterThan(0);

    const n = deleteAllPlayers();
    const after = getDB();
    expect(n).toBe(before.players.length);
    expect(after.players).toEqual([]);
    expect(after.teams.length).toBe(before.teams.length);
    for (const t of after.teams) { expect(t.playerIds).toEqual([]); expect(t.captainId).toBeUndefined(); expect(t.keeperId).toBeUndefined(); }
    expect(after.matches.length).toBe(before.matches.length);
    // old scorecards still read correctly
    expect(playerName(after, someone)).toBe(nameBefore);
    const m2 = after.matches.find((x) => x.id === m.id)!;
    expect(resultOf(m2, nameMap(after)).text).toBe(resultBefore);
    expect(matchCSV(m2, after)).toContain(nameBefore);
    expect(inningsViews(m2).map((v) => v.runs)).toEqual(inningsViews(m).map((v) => v.runs));
  });

  it('deleting all teams keeps players (unassigned) and old matches keep team names', () => {
    resetToSample();
    const before = getDB();
    const m = before.matches.find((x) => x.status === 'completed')!;
    const nameA = teamName(before, m.teamAId);
    const players = before.players.length;

    const n = deleteAllTeams();
    const after = getDB();
    expect(n).toBe(before.teams.length);
    expect(after.teams).toEqual([]);
    expect(after.players.length).toBe(players);
    expect(after.players.every((p) => p.teamId === undefined)).toBe(true);
    expect(after.matches.length).toBe(before.matches.length);
    expect(teamName(after, m.teamAId)).toBe(nameA);
    expect(resultOf(after.matches.find((x) => x.id === m.id)!, nameMap(after)).kind).toBe('win');
  });

  it('deleting one team also remembers its name', () => {
    resetToSample();
    const before = getDB();
    const t = before.teams[0];
    deleteTeam(t.id);
    expect(getDB().teams.some((x) => x.id === t.id)).toBe(false);
    expect(teamName(getDB(), t.id)).toBe(t.name);
  });

  it('deleting all stats removes matches but keeps players, teams and tournaments', () => {
    resetToSample();
    const before = getDB();
    expect(careerStats(before, {}).size).toBeGreaterThan(0);
    const n = deleteAllStats();
    const after = getDB();
    expect(n).toBe(before.matches.length);
    expect(after.matches).toEqual([]);
    expect(after.players.length).toBe(before.players.length);
    expect(after.teams.length).toBe(before.teams.length);
    expect(after.tournaments.length).toBe(before.tournaments.length);
    expect(after.tournaments.every((t) => t.fixtures.every((f) => f.matchId === undefined))).toBe(true);
    for (const s of careerStats(after, {}).values()) { expect(s.matches).toBe(0); expect(s.bat.runs).toBe(0); }
    expect(deleteAllStats()).toBe(0);
  });

  it('is safe on already-empty lists', () => {
    resetToSample(); deleteAllPlayers(); deleteAllTeams();
    expect(deleteAllPlayers()).toBe(0);
    expect(deleteAllTeams()).toBe(0);
  });
});
