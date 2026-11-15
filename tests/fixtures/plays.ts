import type { Assignment, Play, PlayerSlot } from '../../src/domain/types';

/**
 * A fixed board, with ids written down rather than generated.
 *
 * The formation presets number their men from a module-level counter, so a
 * fixture built from them would change its ids with the order the tests ran in
 * — and a golden file that moves when nothing changed is one nobody trusts.
 */
export function offense(): PlayerSlot[] {
  const line = (id: string, label: string, x: number): PlayerSlot => ({
    id, label, side: 'offense', x, y: 0, onLine: true, onLineLocked: false, shape: 'square',
  });
  const back = (id: string, label: string, x: number, y: number, backNumber?: number): PlayerSlot => ({
    id, label, side: 'offense', x, y, onLine: false, onLineLocked: false, backNumber, shape: 'circle',
  });
  return [
    line('lg', 'LG', -1.8),
    line('c', 'C', 0),
    line('rg', 'RG', 1.8),
    line('te', 'TE', 3.6),
    back('wb', 'WB', -5, 1.8),
    back('qb', 'QB', 0, 1.6, 1),
    back('rb', 'RB', 0, 5, 2),
  ];
}

export function defense(): PlayerSlot[] {
  const man = (id: string, label: string, x: number, y: number, shape: PlayerSlot['shape']): PlayerSlot => ({
    id, label, side: 'defense', x, y, onLine: false, onLineLocked: false, shape,
  });
  return [
    man('de1', 'E', -3.6, -1.7, 'x'),
    man('dt', 'N', 0, -1.7, 'x'),
    man('de2', 'E', 3.6, -1.7, 'x'),
    man('w', 'W', -2, -4.5, 'triangle'),
    man('m', 'M', 2, -4.5, 'triangle'),
    man('cb', 'C', -7, -6, 'triangle'),
    man('fs', 'S', 0, -11, 'triangle'),
  ];
}

export function play(over: Partial<Play> = {}): Play {
  return {
    id: 'p1',
    name: '',
    sectionId: 'unfiled',
    players: [...offense(), ...defense()],
    assignments: [],
    annotations: [],
    notes: '',
    coachingPoint: '',
    tags: [],
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...over,
  };
}

export const route = (id: string, playerId: string, over: Partial<Assignment> = {}): Assignment => ({
  id, playerId, kind: 'route', path: [], ...over,
});
