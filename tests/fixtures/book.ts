import { applyCoverage, COVERAGES } from '../../src/domain/presets/coverages';
import { blockPath } from '../../src/domain/presets/blocks';
import { DEFENSE_PRESETS } from '../../src/domain/presets/defense';
import { coverPath, crashPath, loopPath, CRASH, LOOP } from '../../src/domain/presets/links';
import { routeById } from '../../src/domain/presets/routes';
import { computeGaps } from '../../src/domain/gaps';
import type { Assignment, Play } from '../../src/domain/types';
import { VIEW } from '../../src/render/geometry';
import { defense, offense, play, route } from './plays';

const all = () => [...offense(), ...defense()];
const by = (id: string) => all().find((p) => p.id === id)!;
const preset = (id: string, who: string, concept: string, hand: 'right' | 'left', over: Partial<Assignment> = {}) =>
  route(id, who, { preset: concept, hand, path: routeById(concept)!.shape(by(who), hand), ...over });

/** An offensive play wearing every feature the offense has. */
export function sweep(): Play {
  return play({
    id: 'sweep',
    suggestedName: '26 All the way right',
    backNumber: 2,
    hole: 6,
    ballCarrierId: 'rb',
    hideDefense: false,
    players: all().map((p) => (p.id === 'te' ? { ...p, jersey: 88 } : p.id === 'wb' ? { ...p, shape: 'star' as const } : p)),
    assignments: [
      preset('a1', 'rb', 'wide-right', 'right', { kind: 'carry' }),
      preset('a2', 'te', 'out', 'right'),
      preset('a3', 'wb', 'in', 'left', { color: 'var(--route-4)' }),
      { id: 'a4', playerId: 'rg', kind: 'block', targetPlayerId: 'dt', path: blockPath('block', by('rg'), by('dt')) },
      { id: 'a5', playerId: 'lg', kind: 'pull', targetPlayerId: 'de2', path: blockPath('pull', by('lg'), by('de2')) },
      { id: 'a6', playerId: 'c', kind: 'combo', targetPlayerId: 'dt', climbToPlayerId: 'm', path: blockPath('combo', by('c'), by('dt'), by('m')) },
      route('a7', 'qb', { kind: 'motion', path: [{ x: 0, y: 1.6 }, { x: -2, y: 2.4 }] }),
    ],
    vision: { x: 6, y: -8 },
    focuses: [{ playerId: 'te', dx: 0, dy: -6 }],
    annotations: [[{ x: -8, y: -3 }, { x: -6, y: -5, cx: -8, cy: -5 }, { x: -4, y: -5, w: 0.24 }]],
    notes: 'Kick out the end.',
    coachingPoint: 'Patience to the edge.',
    tags: ['run'],
  });
}

/** A defensive play wearing every feature the defense has. */
export function cover3(): Play {
  const players = all();
  const three = COVERAGES.find((c) => c.id === 'cover-3')!;
  const { zones } = applyCoverage(three, players, { halfWidth: VIEW.halfWidth });
  const fire = DEFENSE_PRESETS.find((d) => d.kind === 'blitz')!;
  const ctx = { gaps: computeGaps(players), qb: by('qb') };
  return play({
    id: 'cover3',
    unit: 'defense',
    suggestedName: 'Cover 3',
    players,
    zones: zones.map((z, i) => (i === 0 ? { ...z, color: 'var(--route-3)' } : z)).filter((z) => z.playerId !== 'w'),
    assignments: [
      { id: 'd1', playerId: 'w', kind: 'blitz', preset: fire.id, hand: 'left', path: fire.shape(by('w'), 'left', ctx) },
      { id: 'd2', playerId: 'de2', kind: 'stunt', preset: CRASH, targetPlayerId: 'dt', path: crashPath(by('de2'), by('dt')) },
      { id: 'd3', playerId: 'dt', kind: 'stunt', preset: LOOP, targetPlayerId: 'de2', path: loopPath(by('dt'), by('de2')) },
      { id: 'd4', playerId: 'de1', kind: 'cover', targetPlayerId: 'wb', path: coverPath(by('de1'), by('wb')) },
    ],
  });
}

/** A play with nothing set that a later version of the app added. */
export function oldest(): Play {
  return {
    id: 'oldest',
    name: 'Dive',
    sectionId: 'unfiled',
    players: offense(),
    assignments: [preset('o1', 'rb', 'dive', 'right')],
    annotations: [],
    notes: '',
    coachingPoint: '',
    tags: [],
    createdAt: 1_690_000_000_000,
    updatedAt: 1_690_000_000_000,
  };
}
