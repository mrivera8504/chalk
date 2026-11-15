import { describe, expect, it } from 'vitest';
import { BOARD_ASPECT, DEFAULT_PRINT, centerIn, fitAspect, layout, pageSize, type PrintOptions } from '../../src/export/paper';

const opts = (over: Partial<PrintOptions>): PrintOptions => ({ ...DEFAULT_PRINT, ...over });
const grid = (over: Partial<PrintOptions>, aspect = BOARD_ASPECT) => {
  const l = layout(opts(over), aspect);
  return `${l.cols}x${l.rows}`;
};

describe('the page', () => {
  it('is US letter, turned for landscape', () => {
    expect(pageSize('portrait')).toEqual({ w: 612, h: 792 });
    expect(pageSize('landscape')).toEqual({ w: 792, h: 612 });
  });

  it('has a half-inch margin, a quarter when filling the page', () => {
    expect(layout(opts({})).margin).toBe(36);
    expect(layout(opts({ edgeToEdge: true })).margin).toBe(18);
  });
});

/** The shape a typical play's own window comes out at; see view.ts. */
const PLAY = 24 / 20;

describe('the grid', () => {
  it('stacks two on portrait and sets them side by side on landscape', () => {
    expect(grid({ perPage: 2, orientation: 'portrait' }, PLAY)).toBe('1x2');
    expect(grid({ perPage: 2, orientation: 'landscape' }, PLAY)).toBe('2x1');
  });

  it('swaps 2x3 and 3x2 when the paper turns', () => {
    expect(grid({ perPage: 6, orientation: 'portrait' }, PLAY)).toBe('2x3');
    expect(grid({ perPage: 6, orientation: 'landscape' }, PLAY)).toBe('3x2');
  });

  it('lays a landscape 4-up out 2x2, not four slivers across', () => {
    // The regression: scored with the old fixed board shape, this came out 4x1.
    expect(grid({ perPage: 4, orientation: 'landscape' }, PLAY)).toBe('2x2');
    expect(grid({ perPage: 4, orientation: 'landscape' })).toBe('4x1');
  });

  it('is square at nine', () => {
    expect(grid({ perPage: 9, orientation: 'portrait' })).toBe('3x3');
    expect(grid({ perPage: 9, orientation: 'landscape' })).toBe('3x3');
  });
});

describe('cells', () => {
  it('keep every box inside the margins, for every option', () => {
    for (const orientation of ['portrait', 'landscape'] as const) {
      for (const perPage of [1, 2, 4, 6, 9] as const) {
        for (const edgeToEdge of [false, true]) {
          for (const nameSize of ['normal', 'big', 'huge'] as const) {
            const l = layout(opts({ orientation, perPage, edgeToEdge, nameSize }));
            const where = `${orientation} ${perPage} ${edgeToEdge} ${nameSize}`;
            expect(l.cells, where).toHaveLength(perPage);
            for (const c of l.cells) {
              expect(c.board.w, where).toBeGreaterThan(0);
              expect(c.board.h, where).toBeGreaterThan(0);
              expect(c.board.x, where).toBeGreaterThanOrEqual(l.margin - 0.01);
              expect(c.board.x + c.board.w, where).toBeLessThanOrEqual(l.page.w - l.margin + 0.01);
              expect(c.name.top, where).toBeGreaterThanOrEqual(l.margin - 0.01);
              expect(c.board.top + c.board.h, where).toBeLessThanOrEqual(l.page.h - l.margin + 0.01);
            }
          }
        }
      }
    }
  });

  it('give notes room only at one to a page', () => {
    expect(layout(opts({ perPage: 1, showNotes: true })).notes).not.toBeNull();
    expect(layout(opts({ perPage: 4, showNotes: true })).notes).toBeNull();
    expect(layout(opts({ perPage: 1, showNotes: false })).notes).toBeNull();
  });

  it('have a running head on a grid and none at one-up', () => {
    expect(layout(opts({ perPage: 1 })).head).toBeNull();
    expect(layout(opts({ perPage: 4 })).head).not.toBeNull();
  });

  it('count pages', () => {
    const l = layout(opts({ perPage: 4 }));
    expect([l.pages(0), l.pages(4), l.pages(5)]).toEqual([1, 1, 2]);
  });

  it('resolve to the same numbers they always have', () => {
    const r = (n: number) => Number(n.toFixed(2));
    const out: Record<string, unknown> = {};
    for (const orientation of ['portrait', 'landscape'] as const) {
      for (const perPage of [1, 4, 9] as const) {
        const l = layout(opts({ orientation, perPage }));
        const c = l.cells[0];
        out[`${orientation} ${perPage}`] = {
          nameSize: r(c.nameSize),
          board: [r(c.board.x), r(c.board.top), r(c.board.w), r(c.board.h)],
        };
      }
    }
    expect(out).toMatchSnapshot();
  });
});

describe('fitting a board in a cell', () => {
  it('is limited by whichever side runs out first', () => {
    expect(fitAspect(100, 100, 2)).toEqual({ w: 100, h: 50 });
    expect(fitAspect(100, 100, 0.5)).toEqual({ w: 50, h: 100 });
  });

  it('centers what is left over', () => {
    expect(centerIn({ x: 10, top: 20, w: 100, h: 100 }, 2)).toEqual({ x: 10, top: 45, w: 100, h: 50 });
  });
});
