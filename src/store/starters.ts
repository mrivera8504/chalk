import { framesOf, nextFrame, withFrames } from '../domain/frames';
import { eligibleReceivers } from '../domain/legality';
import { applyCoverage, COVERAGES } from '../domain/presets/coverages';
import { HOOPS_ACTIONS, makePass, makeScreen, makeShot } from '../domain/presets/hoops';
import { ROUTES, naturalHand, type RoutePreset } from '../domain/presets/routes';
import { SOCCER_ACTIONS } from '../domain/presets/soccer';
import { makeCover } from '../domain/presets/links';
import type { Assignment, Hand, Play, PlayerSlot } from '../domain/types';
import { VIEW } from '../render/geometry';
import { surfaceOf } from '../sports';
import { GOAL } from '../sports/soccer/pitch';
import { blankPlay, newId } from './usePlaybook';

/*
 * A few plays a new playbook can start from.
 *
 * Built, not shipped: each one is the sport's own first set with its own
 * presets laid on it, through the same functions a coach's tap runs. So a
 * starter is an ordinary play in every respect — every line is a preset that
 * flips, deepens and erases like one the coach drew — and a starter for 9-man
 * is laid on the 9-man set rather than squeezed from a 7-man one.
 *
 * Nothing here is anybody's playbook. These are the plays every coach of the
 * game recognizes, so the first thing a new coach does is edit rather than
 * stare at an empty page.
 */

const PRESETS: RoutePreset[] = [...ROUTES, ...HOOPS_ACTIONS, ...SOCCER_ACTIONS];

function job(man: PlayerSlot, presetId: string, hand?: Hand): Assignment {
  const preset = PRESETS.find((p) => p.id === presetId)!;
  const h = hand ?? preset.hand ?? naturalHand(man);
  return {
    id: newId('a'),
    playerId: man.id,
    kind: preset.line ?? (preset.carry ? 'carry' : 'route'),
    path: preset.shape(man, h),
    preset: preset.id,
    hand: h,
  };
}

function named(play: Play, name: string, over: Partial<Play> = {}): Play {
  return { ...play, name, ...over };
}

function football(variant?: string, blocking = true): Play[] {
  const out: Play[] = [];
  const base = () => blankPlay(undefined, 'offense', undefined, variant);

  // Runs: the back, straight ahead and then round the edge.
  for (const [name, preset] of [
    ['Dive', 'dive'],
    ['Sweep', 'sweep'],
  ] as const) {
    const p = base();
    const back = p.players.find((m) => m.backNumber === 2) ?? p.players.find((m) => m.backNumber === 1);
    if (!back) continue;
    out.push(named(p, name, { assignments: [job(back, preset)], ballCarrierId: back.id }));
  }

  // Passes: every eligible man out on a route, the quarterback keeping the ball.
  const routes: [string, string[]][] = [
    ['Slants', ['slant']],
    ['Four verticals', ['go']],
    ['Flood', ['corner', 'out', 'hitch', 'post', 'slant']],
  ];
  for (const [name, cycle] of routes) {
    const p = base();
    const receivers = eligibleReceivers(p.players).filter((m) => m.backNumber !== 2 || name === 'Flood');
    out.push(
      named(p, name, {
        assignments: receivers.map((m, i) => job(m, cycle[i % cycle.length])),
      }),
    );
  }

  // A defense to start the other side of the ball from.
  const d = blankPlay(undefined, 'defense', undefined, variant);
  const cover = COVERAGES.find((c) => c.id === (blocking ? 'cover-3' : 'cover-2'))!;
  const call = applyCoverage(cover, d.players, VIEW);
  const ropes = call.man.flatMap(({ defenderId, receiverId }) => {
    const a = d.players.find((m) => m.id === defenderId);
    const b = d.players.find((m) => m.id === receiverId);
    return a && b ? [makeCover(a, b)] : [];
  });
  out.push(named(d, cover.name, { zones: call.zones, assignments: ropes }));
  return out;
}

function basketball(variant: string): Play[] {
  const p = () => blankPlay(undefined, 'offense', undefined, variant);
  const by = (play: Play, label: string) => play.players.find((m) => m.label === label)!;

  // Backdoor: the wing steps out and goes behind his man; the point hits him.
  const backdoor = p();
  const two = by(backdoor, '2');
  const cut = job(two, 'hoops-backdoor');
  const first = { ...framesOf(backdoor)[0], assignments: [cut, makePass(by(backdoor, '1'), two, [cut])] };
  const second = nextFrame(first);
  const shooter = second.players.find((m) => m.id === two.id)!;
  second.assignments = [makeShot(shooter, [])];
  const backdoorPlay = named(withFrames(backdoor, [first, second]), 'Backdoor');

  // Pick and roll: the big screens for the point, the point drives.
  const pnr = p();
  const pnrPlay = named(pnr, 'Pick and roll', {
    assignments: [makeScreen(by(pnr, '5'), by(pnr, '1')), job(by(pnr, '1'), 'hoops-drive')],
  });

  // Corner swing: the ball goes round the outside to the corner shooter.
  const swing = p();
  const swingPlay = named(swing, 'Swing to the corner', {
    assignments: [
      makePass(by(swing, '1'), by(swing, '3'), []),
      job(by(swing, '4'), 'hoops-flash'),
    ],
  });
  return [backdoorPlay, pnrPlay, swingPlay];
}

function soccer(variant: string): Play[] {
  const p = () => blankPlay(undefined, 'offense', undefined, variant);
  const has = (play: Play, label: string) => play.players.find((m) => m.side === 'offense' && m.label === label);
  const holder = (play: Play) => play.players.find((m) => m.id === play.ballCarrierId)!;
  const out: Play[] = [];

  // Through ball: the striker runs in behind and the midfield finds him.
  const through = p();
  const st = has(through, 'ST');
  if (st) {
    const run = job(st, 'soccer-through');
    out.push(
      named(through, 'Through ball', {
        assignments: [run, makePass(holder(through), st, [run]), makeShot(st, [run], GOAL)],
      }),
    );
  }

  // Overlap: the full back goes round the outside of the man in front of him.
  const overlap = p();
  const back = has(overlap, 'RB') ?? has(overlap, 'CB');
  if (back) out.push(named(overlap, 'Overlap', { assignments: [job(back, 'soccer-overlap', 'right')] }));

  // Wide and in: the wide men stretch it, the ball goes to the far side.
  const wide = p();
  const wideMen = wide.players.filter((m) => m.side === 'offense' && /^(L|R)(M|W|WB)$/.test(m.label));
  out.push(
    named(wide, 'Switch', {
      assignments: [
        ...wideMen.map((m) => job(m, 'soccer-wide')),
        ...(wideMen[0] ? [makePass(holder(wide), wideMen[0], [])] : []),
      ],
    }),
  );
  return out;
}

/** The starter plays for a kind of game, unfiled and ready to edit. */
export function starterPlays(variant?: string): Play[] {
  const surface = surfaceOf(variant);
  // A sport pack has no concepts to build a starter out of: none to offer.
  if (surface !== 'court' && surface !== 'pitch' && surface !== 'field') return [];
  const plays =
    surface === 'court'
      ? basketball(variant!)
      : surface === 'pitch'
        ? soccer(variant!)
        : football(variant, !/flag/.test(variant ?? ''));
  return plays.map((p) => ({ ...p, tags: [...p.tags, 'starter'] }));
}
