import { VIEW } from '../render/geometry';
// Type-only, deliberately: `render.tsx` takes `BOARD_ASPECT` back from here, and
// a value import in this direction would close that loop at runtime.
import type { SheetOptions } from './render';

/**
 * Where everything lands on the paper.
 *
 * Pure arithmetic, no pdf-lib and no React, because two very different things
 * have to agree about it: `pdf.ts`, which draws the real sheet, and
 * `PrintPanel.tsx`, which shows the coach what the sheet is going to be. A
 * preview that computed its own layout would be a preview of nothing — it would
 * drift the first time either side was touched, and the drift would only ever
 * show up on paper, after the printing.
 *
 * Coordinates here are **top-left origin**, like the screen. PDF space counts
 * from the bottom, so `pdf.ts` flips at the point of drawing and nothing else
 * has to think about it.
 */

/** Points. Letter, the one size every coach's printer has. */
const LETTER = { w: 612, h: 792 };

export type Orientation = 'portrait' | 'landscape';
export type PerPage = 1 | 2 | 4 | 6 | 9;
export type NameSize = 'normal' | 'big' | 'huge';

export interface PrintOptions extends SheetOptions {
  orientation: Orientation;
  perPage: PerPage;
  /**
   * Run the art to the edge of the paper.
   *
   * Not literally zero: no consumer printer images the last few millimetres, so
   * a layout that assumed it would have the outermost play clipped on every
   * sheet. This goes to the edge of what the hardware can actually reach.
   */
  edgeToEdge: boolean;
  nameSize: NameSize;
  /** The coaching point, the notes and who is in it. Only ever fits at 1-up. */
  showNotes: boolean;
}

export const DEFAULT_PRINT: PrintOptions = {
  orientation: 'portrait',
  perPage: 1,
  edgeToEdge: false,
  nameSize: 'big',
  showNotes: true,
  showHoles: true,
  showGaps: false,
};

/** The board's proportions — 22 yards across, 30 deep. Taller than it is wide. */
export const BOARD_ASPECT = (VIEW.halfWidth * 2) / (VIEW.downfield + VIEW.behind);

/**
 * A binder margin, and the smallest margin a printer will actually image.
 *
 * Half an inch and a quarter. Both came down: every point of margin is a point
 * the play does not get, and on a landscape sheet — where the height is what
 * the play is limited by — the top and bottom margins are the expensive ones.
 */
const MARGIN = { normal: 36, edge: 18 };

const GUTTER = 14;

/** Top-left origin, like the screen. */
export interface Rect {
  x: number;
  top: number;
  w: number;
  h: number;
}

export interface Cell {
  /** Where the name goes: the full cell width, so it can be centred in it. */
  name: Rect;
  nameSize: number;
  /** Where the diagram goes, already centred and in the board's proportions. */
  board: Rect;
}

export interface Layout {
  page: { w: number; h: number };
  margin: number;
  /** The running head, or null at 1-up where the play's own name is the head. */
  head: Rect | null;
  cols: number;
  rows: number;
  cells: Cell[];
  /** Where the notes go at 1-up, if they were asked for and there is room. */
  notes: Rect | null;
  pages: (count: number) => number;
}

export function pageSize(o: Orientation): { w: number; h: number } {
  return o === 'landscape' ? { w: LETTER.h, h: LETTER.w } : { ...LETTER };
}


/** Fit a box of a given aspect inside another, centred in what is left. */
export function fitAspect(bw: number, bh: number, aspect: number): { w: number; h: number } {
  const w = Math.min(bw, bh * aspect);
  return { w, h: w / aspect };
}

/**
 * Centre a board of a given shape inside the room it was given.
 *
 * The shape comes from the play — see `view.ts` — so the board no longer
 * stretches to fill the cell. On a wide sheet a deep play leaves white either
 * side of itself, and that is the right answer: filling it meant drawing
 * thirteen yards of play in the middle of thirty-seven yards of empty grass,
 * and the grass is white on paper anyway.
 */
export function centreIn(area: Rect, aspect: number): Rect {
  const box = fitAspect(area.w, area.h, aspect);
  return {
    x: area.x + (area.w - box.w) / 2,
    top: area.top + (area.h - box.h) / 2,
    w: box.w,
    h: box.h,
  };
}


/**
 * How many across and how many down.
 *
 * Worked out rather than hard-coded, because the right answer depends on the
 * orientation and the old code only knew the portrait one. The board is taller
 * than it is wide, so two plays on a landscape page want to be side by side and
 * two on a portrait page want to be stacked — and 2×3 and 3×2 swap places the
 * moment the paper turns. Every exact factorisation is tried and the one that
 * draws the biggest play wins, which gets both cases right without either being
 * written down.
 */
function bestGrid(
  perPage: number,
  availW: number,
  availH: number,
  labelH: number,
  boardAspect: number,
): { cols: number; rows: number } {
  let best = { cols: 1, rows: perPage, area: -1 };
  for (let cols = 1; cols <= perPage; cols++) {
    if (perPage % cols !== 0) continue;
    const rows = perPage / cols;
    const cellW = (availW - GUTTER * (cols - 1)) / cols;
    const cellH = (availH - GUTTER * (rows - 1)) / rows;
    if (cellW <= 0 || cellH - labelH <= 0) continue;
    // Scored at the shape the board will actually take in that cell, which now
    // comes from the play rather than from a fixed window.
    const box = fitAspect(cellW, cellH - labelH, boardAspect);
    const area = box.w * box.h;
    if (area > best.area) best = { cols, rows, area };
  }
  return { cols: best.cols, rows: best.rows };
}

/**
 * How big the play's name is, before the coach's multiplier.
 *
 * Tied to the width of the cell it sits in rather than fixed, so a name stays
 * in proportion to the play whether it is one to a page or one of nine. The
 * floor is the size below which a name stops being readable across a huddle,
 * which is the only reason it is on the sheet.
 */
const NAME_SCALE: Record<NameSize, number> = { normal: 1, big: 1.45, huge: 2.1 };

/**
 * The band the name sits in, as a multiple of the letters themselves.
 *
 * 1.28, not the 1.5 it was. The band is pure chrome and it is subtracted from
 * the height, which on landscape is the dimension the play is limited by — a
 * 'Huge' name was taking an inch and a third of an 8½-inch sheet before the
 * board got a look at it.
 */
const NAME_BAND = 1.28;

function nameSizeFor(cellW: number, which: NameSize): number {
  const base = Math.max(9, Math.min(30, cellW * 0.062));
  return base * NAME_SCALE[which];
}

/**
 * The whole page, resolved.
 *
 * One call gives both renderers the page, the margin, the running head, the
 * grid and a box for every play on it.
 */
export function layout(opts: PrintOptions, boardAspect = BOARD_ASPECT): Layout {
  const page = pageSize(opts.orientation);
  const margin = opts.edgeToEdge ? MARGIN.edge : MARGIN.normal;

  // At 1-up the play's name IS the header, big and centred over the board, so
  // there is no second line of chrome above it repeating the sheet's title.
  const wantsHead = opts.perPage > 1;
  const headH = wantsHead ? 24 : 0;
  const head: Rect | null = wantsHead
    ? { x: margin, top: margin, w: page.w - margin * 2, h: headH }
    : null;

  const availW = page.w - margin * 2;
  const availH = page.h - margin * 2 - headH;

  // A first guess at the label band, so the grid can be chosen knowing roughly
  // what the names will cost it, then the real size once the cells are known.
  const guess = nameSizeFor(availW / Math.max(1, Math.round(Math.sqrt(opts.perPage))), opts.nameSize);
  const { cols, rows } = bestGrid(opts.perPage, availW, availH, guess * NAME_BAND, boardAspect);

  const cellW = (availW - GUTTER * (cols - 1)) / cols;
  const cellH = (availH - GUTTER * (rows - 1)) / rows;
  const nameSize = nameSizeFor(cellW, opts.nameSize);
  const labelH = nameSize * NAME_BAND;

  // Notes only at 1-up. On a grid there is no room for them, and a call sheet
  // is read at a glance anyway: the name is the whole point of it.
  //
  // A landscape sheet leaves a gutter down each side, and putting the notes
  // there instead — buying back the height, which is the dimension a play is
  // short of on wide paper — was tried and taken out again. The gutter comes to
  // about an inch and a quarter, and the notes are set on one line each and
  // ellipsized rather than wrapped, so a column that narrow simply cut them
  // off. It would need a wrapping text setter to be worth it.
  const notesH = opts.showNotes && opts.perPage === 1 ? 44 : 0;

  // The room the board is given. What actually lands in it is centred at the
  // play's own shape by `centreIn`, once the caller has worked out the window.
  const box = { w: cellW, h: cellH - labelH - notesH };

  /*
   * Whatever height the cell did not need, split above and below.
   *
   * The board is taller than it is wide, so a cell is almost always limited by
   * its width and has height left over — four across a landscape page leaves
   * nearly half the paper. Hung from the top of the cell, that surplus all
   * collected at the foot of the sheet and the whole page read as though the
   * printing had been cut off. It costs nothing to give half of it back.
   */
  const blockH = labelH + box.h + notesH;
  const yPad = Math.max(0, (cellH - blockH) / 2);

  const cells: Cell[] = [];
  for (let i = 0; i < opts.perPage; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = margin + col * (cellW + GUTTER);
    const top = margin + headH + row * (cellH + GUTTER) + yPad;
    cells.push({
      name: { x, top, w: cellW, h: labelH },
      nameSize,
      board: {
        // Centred across the cell too, which is what makes a 3-up row read as a
        // row rather than as three plays pushed against their left edges.
        x: x + (cellW - box.w) / 2,
        top: top + labelH,
        w: box.w,
        h: box.h,
      },
    });
  }

  const last = cells[cells.length - 1];
  const notes: Rect | null = notesH
    ? {
        x: margin,
        top: Math.min(last.board.top + last.board.h + 10, page.h - margin - notesH),
        w: availW,
        h: notesH,
      }
    : null;

  return {
    page,
    margin,
    head,
    cols,
    rows,
    cells,
    notes,
    pages: (count) => Math.max(1, Math.ceil(count / opts.perPage)),
  };
}
