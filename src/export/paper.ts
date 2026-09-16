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
  showDefense: false,
  showGaps: false,
};

/** The board's proportions — 22 yards across, 30 deep. Taller than it is wide. */
export const BOARD_ASPECT = (VIEW.halfWidth * 2) / (VIEW.downfield + VIEW.behind);

/** A binder margin, and the smallest margin a printer will actually image. */
const MARGIN = { normal: 40, edge: 14 };

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

/**
 * How far the field window is allowed to be stretched to match a cell.
 *
 * Wider than a phone board in one direction and squarer in the other. Past
 * these the window stops following the cell: a very wide slot would be filled
 * with empty sideline, and a very tall one with grass nobody runs into.
 */
const ASPECT_RANGE = { min: 0.62, max: 1.85 };

function clampNum(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

/** Fit a box of a given aspect inside another, centred in what is left. */
export function fitAspect(bw: number, bh: number, aspect: number): { w: number; h: number } {
  const w = Math.min(bw, bh * aspect);
  return { w, h: w / aspect };
}

/** Fit a board at its own screen proportions. Still used by the fixed sheets. */
export function boxFit(bw: number, bh: number): { w: number; h: number } {
  return fitAspect(bw, bh, BOARD_ASPECT);
}

/**
 * The board's box inside a cell of a given size.
 *
 * The one place that decides it, because the grid chooser and the layout both
 * need the answer and they must not disagree. They did: the chooser was still
 * sizing candidates with the board's old fixed 22-by-30 shape while the layout
 * had moved on to filling the cell, so a landscape 4-up was scored as though
 * each play were a tall sliver and four-across won. Under the rule actually
 * used, 2×2 draws a play nearly twice the size.
 */
function boardBox(cellW: number, cellH: number): { w: number; h: number } {
  const raw = { w: cellW, h: cellH };
  const ratio = raw.h > 0 ? raw.w / raw.h : BOARD_ASPECT;
  return ratio < ASPECT_RANGE.min || ratio > ASPECT_RANGE.max
    ? fitAspect(raw.w, raw.h, clampNum(ratio, ASPECT_RANGE.min, ASPECT_RANGE.max))
    : raw;
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
): { cols: number; rows: number } {
  let best = { cols: 1, rows: perPage, area: -1 };
  for (let cols = 1; cols <= perPage; cols++) {
    if (perPage % cols !== 0) continue;
    const rows = perPage / cols;
    const cellW = (availW - GUTTER * (cols - 1)) / cols;
    const cellH = (availH - GUTTER * (rows - 1)) / rows;
    if (cellW <= 0 || cellH - labelH <= 0) continue;
    const box = boardBox(cellW, cellH - labelH);
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
export function layout(opts: PrintOptions): Layout {
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
  const { cols, rows } = bestGrid(opts.perPage, availW, availH, guess * 1.5);

  const cellW = (availW - GUTTER * (cols - 1)) / cols;
  const cellH = (availH - GUTTER * (rows - 1)) / rows;
  const nameSize = nameSizeFor(cellW, opts.nameSize);
  const labelH = nameSize * 1.5;

  // Notes only at 1-up. On a grid there is no room for them, and a call sheet
  // is read at a glance anyway: the name is the whole point of it.
  const notesH = opts.showNotes && opts.perPage === 1 ? 58 : 0;

  /*
   * The board takes the whole cell, rather than being cut down to the board's
   * own proportions.
   *
   * It used to be `boxFit`, which fitted a fixed 22-by-30 window into the cell
   * and centred it — so turning the paper sideways bought nothing but wider
   * margins. The window is no longer fixed: `view.ts` shapes it to whatever box
   * it is given, growing the field sideways rather than the paper's white. So
   * the box is simply the room available, and the play fills it.
   *
   * The shape is fenced in either direction all the same. A 9-up cell or a
   * `Fill the page` 2-up can be extreme enough that matching it would show
   * forty yards of empty sideline, or a letterbox slot with no depth to run a
   * route in, so past those limits it goes back to fitting and centring.
   */
  const box = boardBox(cellW, cellH - labelH - notesH);

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
