import { describe, expect, it } from 'vitest';
import { boardView, viewForPlays } from '../../src/export/view';
import { viewFor } from '../../src/sports';
import { PITCH, PITCH_VIEW } from '../../src/sports/soccer/pitch';
import { starterPlays } from '../../src/store/starters';
import type { Play } from '../../src/domain/types';

const soccer = (): Play => starterPlays('soccer11')[0];

describe('a part of the pitch', () => {
  it('is the whole pitch when the play says nothing, as every soccer play was', () => {
    expect(viewFor('soccer11')).toEqual(PITCH_VIEW);
    expect(viewFor('soccer11', undefined)).toEqual(PITCH_VIEW);
  });

  it('keeps the full width and cuts the depth to the attacking half or third', () => {
    const half = viewFor('soccer11', 'half');
    const third = viewFor('soccer11', 'third');
    expect(half.halfWidth).toBe(PITCH_VIEW.halfWidth);
    expect(third.halfWidth).toBe(PITCH_VIEW.halfWidth);
    expect(half.downfield + half.behind).toBeCloseTo(PITCH.halfLength + 2.6);
    expect(third.downfield + third.behind).toBeCloseTo((PITCH.halfLength * 2) / 3 + 2.6);
  });

  it('means nothing off a pitch', () => {
    expect(viewFor(undefined, 'half')).toEqual(viewFor(undefined));
    expect(viewFor('hoops', 'third')).toEqual(viewFor('hoops'));
  });

  it('is what the card, the video and the sheet draw', () => {
    const play = { ...soccer(), pitchView: 'third' as const };
    const v = boardView(play);
    expect(v.y).toBeCloseTo(-PITCH_VIEW.downfield);
    expect(v.h).toBeCloseTo((PITCH.halfLength * 2) / 3 + 2.6);
    expect(viewForPlays([play, { ...play, id: 'b' }], 1.3)).toEqual(v);
  });

  it('leaves a sheet of plays with no part set windowed as before', () => {
    const play = soccer();
    expect(viewForPlays([play], 1.3)).not.toEqual(boardView(play));
  });
});
