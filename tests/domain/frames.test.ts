import { describe, expect, it } from 'vitest';
import { framesOf, nextFrame, withFrames, type Frame } from '../../src/domain/frames';
import { playbackLength, poseAt, RUN_MS, HOLD_MS } from '../../src/domain/playback';
import { makePass, makeShot } from '../../src/domain/presets/hoops';
import { refreshPaths } from '../../src/domain/regenerate';
import { fromCloud, toCloud } from '../../src/store/sync';
import { blankPlay } from '../../src/store/usePlaybook';
import { play as fixture } from '../fixtures/plays';

const sweep = fixture();

const hoops = () => {
  const play = blankPlay(undefined, 'offense', undefined, 'hoops');
  const man = (label: string) => play.players.find((p) => p.label === label)!;
  return { play, man };
};

describe('steps', () => {
  it('reads a play saved before there were any as one step, and writes it back unchanged', () => {
    const steps = framesOf(sweep);
    expect(steps.length).toBe(1);
    expect(withFrames(sweep, steps)).toEqual(sweep);
    expect('frames' in withFrames(sweep, steps)).toBe(false);
  });

  it('keeps the first step on the play itself, so anything old still draws it', () => {
    const { play } = hoops();
    const second = nextFrame(framesOf(play)[0]);
    const saved = withFrames(play, [framesOf(play)[0], second]);
    expect(saved.players).toBe(play.players);
    expect(saved.frames).toEqual([second]);
    expect(framesOf(saved).length).toBe(2);
  });

  it('starts the next step with everybody where their line left them', () => {
    const { play, man } = hoops();
    const two = man('2');
    const first: Frame = {
      ...framesOf(play)[0],
      assignments: [
        { id: 'c', playerId: two.id, kind: 'route', path: [{ x: two.x, y: two.y }, { x: 0, y: 3 }] },
      ],
    };
    const next = nextFrame(first);
    expect(next.players.find((p) => p.id === two.id)).toMatchObject({ x: 0, y: 3 });
    expect(next.players.find((p) => p.label === '4')).toMatchObject({ x: man('4').x, y: man('4').y });
    expect(next.assignments).toEqual([]);
    // The step it came from is not touched.
    expect(first.players.find((p) => p.id === two.id)).toMatchObject({ x: two.x, y: two.y });
  });

  it('hands the ball to whoever it was passed to, and only then', () => {
    const { play, man } = hoops();
    const first = framesOf(play)[0];
    expect(first.ballCarrierId).toBe(man('1').id);
    expect(nextFrame(first).ballCarrierId).toBe(man('1').id);
    const passed = { ...first, assignments: [makePass(man('1'), man('3'), [])] };
    expect(nextFrame(passed).ballCarrierId).toBe(man('3').id);
    // A pass drawn off somebody who does not have it moves nothing.
    const other = { ...first, assignments: [makePass(man('2'), man('3'), [])] };
    expect(nextFrame(other).ballCarrierId).toBe(man('1').id);
  });

  it('rebuilds a screen from its two men before moving anybody along it', () => {
    const { play, man } = hoops();
    const first = framesOf(play)[0];
    // Saved with a path from before either man was dragged: stale on purpose.
    const stale = { id: 's', playerId: man('5').id, kind: 'screen' as const, targetPlayerId: man('2').id, path: [{ x: 0, y: 0 }, { x: 1, y: 1 }] };
    const five = nextFrame({ ...first, assignments: [stale] }).players.find((p) => p.label === '5')!;
    const gap = Math.hypot(five.x - man('2').x, five.y - man('2').y);
    // A shoulder short of the man it is set for, not at (1, 1).
    expect(gap).toBeGreaterThan(1);
    expect(gap).toBeLessThan(2.2);
  });

  it('survives the cloud with ink on a later step', () => {
    const { play } = hoops();
    const inked: Frame = { ...nextFrame(framesOf(play)[0]), annotations: [[{ x: 1, y: 1 }, { x: 2, y: 2 }]] };
    const saved = withFrames(play, [framesOf(play)[0], inked]);
    const up = toCloud([saved])[0] as { frames: { annotations: unknown[] }[] };
    // No array directly inside an array, anywhere: Firestore refuses the write.
    expect(Array.isArray(up.frames[0].annotations[0])).toBe(false);
    expect(fromCloud([up])[0]).toEqual(saved);
  });
});

describe('playback', () => {
  const { play, man } = hoops();
  const one = man('1');
  const three = man('3');
  const first: Frame = {
    ...framesOf(play)[0],
    assignments: refreshPaths(
      [
        { id: 'd', playerId: one.id, kind: 'dribble', path: [{ x: one.x, y: one.y }, { x: 4, y: 6 }] },
        makePass(one, three, []),
      ],
      play.players,
    ),
  };
  const second: Frame = { ...nextFrame(first), assignments: [] };
  second.assignments = [makeShot(second.players.find((p) => p.id === three.id)!, [])];
  const frames = [first, second];
  const where = (ms: number, id: string) => poseAt(frames, ms).players.find((p) => p.id === id)!;

  it('runs each step for the same time, and holds between them', () => {
    expect(playbackLength(frames)).toBe(2 * (RUN_MS + HOLD_MS));
  });

  it('starts everybody where they stand and ends them at the end of their line', () => {
    expect(where(0, one.id)).toMatchObject({ x: one.x, y: one.y });
    expect(where(RUN_MS, one.id).x).toBeCloseTo(4);
    expect(where(RUN_MS + HOLD_MS - 1, one.id).y).toBeCloseTo(6);
    expect(where(RUN_MS / 2, three.id)).toMatchObject({ x: three.x, y: three.y });
  });

  it('keeps the ball in his hands, then in the air, then in the receiver’s', () => {
    expect(poseAt(frames, 0)).toMatchObject({ holder: one.id, ball: null });
    const mid = poseAt(frames, RUN_MS * 0.5);
    expect(mid.holder).toBeNull();
    expect(mid.ball).not.toBeNull();
    expect(poseAt(frames, RUN_MS * 0.9)).toMatchObject({ holder: three.id, ball: null });
  });

  it('opens the second step with the receiver holding it, and ends the shot at the rim', () => {
    const start = RUN_MS + HOLD_MS;
    expect(poseAt(frames, start)).toMatchObject({ step: 1, holder: three.id });
    const end = poseAt(frames, start + RUN_MS);
    expect(end.holder).toBeNull();
    expect(end.ball!.y).toBeCloseTo(1.75);
    expect(end.ball!.x).toBeCloseTo(0);
  });

  it('never runs past the last step', () => {
    expect(poseAt(frames, 1e9).step).toBe(1);
    expect(poseAt(frames, -5).step).toBe(0);
  });
});

describe('every step on a sheet', () => {
  it('is one board per step, in order, named for the play and the step', async () => {
    const { expandSteps } = await import('../../src/domain/frames');
    const base = fixture({ id: 'p', name: 'Horns' });
    const two = withFrames(base, [framesOf(base)[0], nextFrame(framesOf(base)[0])]);
    const out = expandSteps([two]);
    expect(out.map((p) => p.name)).toEqual(['Horns · 1/2', 'Horns · 2/2']);
    expect(out.map((p) => p.id)).toEqual(['p#1', 'p#2']);
    expect(out.every((p) => p.frames === undefined)).toBe(true);
  });

  it('leaves a play with one step as it is', async () => {
    const { expandSteps } = await import('../../src/domain/frames');
    const one = fixture({ id: 'q' });
    expect(expandSteps([one])).toEqual([one]);
  });
});
