import { describe, expect, it } from 'vitest';
import { framesOf, nextFrame, withFrames } from '../../src/domain/frames';
import { HOLD_MS, RUN_MS } from '../../src/domain/playback';
import { VIDEO_FPS, videoFrames } from '../../src/export/video';
import { play, route } from '../fixtures/plays';

describe('a play as a video', () => {
  const base = play();
  const two = withFrames(base, [framesOf(base)[0], nextFrame(framesOf(base)[0])]);

  it('runs as long as the board runs it, plus a beat on the set', () => {
    const one = videoFrames(base).length;
    const both = videoFrames(two).length;
    // A second step adds one step's worth of frames, and no more.
    expect((both - one) / VIDEO_FPS).toBeCloseTo((RUN_MS + HOLD_MS) / 1000, 0);
  });

  it('draws every frame through the exporter, in the play’s own window', () => {
    const frames = videoFrames(base);
    for (const svg of [frames[0], frames[frames.length - 1]]) {
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('viewBox="-11 -20 22 30"');
    }
  });

  it('starts on the set and ends somewhere else when somebody moves', () => {
    const still = videoFrames(base);
    expect(still[0]).toBe(still[still.length - 1]);
    const runner = base.players.find((p) => p.side === 'offense' && !p.onLine)!;
    const moving = play({
      assignments: [route('r', runner.id, { path: [{ x: runner.x, y: runner.y }, { x: runner.x + 6, y: -8 }] })],
    });
    const frames = videoFrames(moving);
    expect(frames[0]).not.toBe(frames[frames.length - 1]);
  });
});
