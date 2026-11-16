import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { boardView, viewForPlays } from '../../src/export/view';
import { Court } from '../../src/render/Court';
import { viewFor } from '../../src/sports';
import { COURT, COURT_FULL_VIEW, COURT_VIEW } from '../../src/sports/basketball/court';
import { starterPlays } from '../../src/store/starters';

const box = (v: typeof COURT_VIEW) => ({ x: -v.halfWidth, y: -v.downfield, w: v.halfWidth * 2, h: v.downfield + v.behind });
const rims = (svg: string) => (svg.match(/var\(--los\)/g) ?? []).length;

describe('the full court', () => {
  it('is a half court unless the play says otherwise, as every play drawn before was', () => {
    expect(viewFor('hoops')).toEqual(COURT_VIEW);
    expect(viewFor('hoops', undefined, 'full')).toEqual(COURT_FULL_VIEW);
    expect(COURT_FULL_VIEW.behind).toBeCloseTo(COURT.length * 2 + 1.3);
  });

  it('draws both baskets on the whole floor, and one on the half', () => {
    expect(rims(renderToStaticMarkup(<svg><Court view={box(COURT_VIEW)} /></svg>))).toBe(1);
    expect(rims(renderToStaticMarkup(<svg><Court view={box(COURT_FULL_VIEW)} /></svg>))).toBe(2);
  });

  it('is what the card and the sheet draw', () => {
    const play = { ...starterPlays('hoops')[0], courtView: 'full' as const };
    expect(boardView(play).h).toBeCloseTo(COURT_FULL_VIEW.downfield + COURT_FULL_VIEW.behind);
    const half = starterPlays('hoops')[1];
    expect(viewForPlays([half, play], 1).h).toBeCloseTo(COURT_FULL_VIEW.downfield + COURT_FULL_VIEW.behind);
    expect(viewForPlays([half], 1).h).toBeCloseTo(COURT_VIEW.downfield + COURT_VIEW.behind);
  });
});
