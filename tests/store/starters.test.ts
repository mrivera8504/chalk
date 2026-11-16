import { describe, expect, it } from 'vitest';
import { checkFormation } from '../../src/domain/legality';
import { refreshPaths } from '../../src/domain/regenerate';
import { DEFAULT_SETTINGS } from '../../src/domain/types';
import { SPORTS } from '../../src/sports';
import { rulesFor } from '../../src/sports/football';
import { starterPlays } from '../../src/store/starters';

describe('starter plays', () => {
  for (const sport of SPORTS) {
    for (const v of sport.variants) {
      it(`gives ${sport.name} ${v.name} plays that are whole and legal`, () => {
        const plays = starterPlays(v.id);
        expect(plays.length).toBeGreaterThanOrEqual(3);
        const ids = new Set(plays.map((p) => p.id));
        expect(ids.size).toBe(plays.length);
        for (const p of plays) {
          expect(p.name, 'named').toBeTruthy();
          expect(p.tags).toContain('starter');
          expect(p.assignments.length + (p.zones?.length ?? 0), p.name).toBeGreaterThan(0);
          // Every line names a man on the board, and survives being rebuilt.
          const men = new Set(p.players.map((m) => m.id));
          for (const a of p.assignments) {
            expect(men.has(a.playerId), `${p.name} ${a.kind}`).toBe(true);
            if (a.targetPlayerId) expect(men.has(a.targetPlayerId), `${p.name} ${a.kind} target`).toBe(true);
          }
          expect(refreshPaths(p.assignments, p.players).length).toBe(p.assignments.length);
          if (sport.id === 'football' && p.unit !== 'defense') {
            const rules = rulesFor(p.variant, DEFAULT_SETTINGS);
            expect(checkFormation(p.players, rules), `${v.name} ${p.name}`).toEqual([]);
          }
        }
      });
    }
  }
});
