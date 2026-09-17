import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib';
import { byJersey, describePersonnel, type RosterEntry } from '../domain/roster';
import { type Play } from '../domain/types';
import { centreIn, DEFAULT_PRINT, layout, type PrintOptions, type Rect } from './paper';
import { playToPng, playTitle, type SheetOptions } from './render';
import type { View } from './view';
import { contentAspect, viewForPlays } from './view';

/** Points. Letter portrait, for the sheets that are lists rather than plays. */
const PAGE = { w: 612, h: 792 };
const MARGIN = 40;

/**
 * Raster width for an embedded diagram, in pixels.
 *
 * Sized from the box the play is actually going into rather than fixed, which
 * is what it used to be: one number chosen for a half-page cell, which left a
 * full-page install sheet soft and a 9-up call sheet carrying four times the
 * pixels it could show. 300 DPI is `pt * 300/72`. The ceiling is there because
 * a big playbook rasterizes every play on a phone, and the floor because a
 * thumbnail still has to survive a photocopier.
 */
function rasterFor(boxWidthPt: number): number {
  return Math.round(Math.max(700, Math.min(2400, boxWidthPt * (300 / 72))));
}

const BLACK = rgb(0, 0, 0);
const GREY = rgb(0.42, 0.42, 0.42);
const RULE = rgb(0.78, 0.78, 0.78);

interface Fonts {
  body: PDFFont;
  bold: PDFFont;
}

/** Trim to fit a width, with an ellipsis, so a long name cannot run off a cell. */
function fit(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, size) > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}

/**
 * Shrink a name until it fits, and only then start cutting letters off it.
 *
 * A play's name is the one thing on the sheet that has to be read, so
 * 'Trips Right Y-Cross' losing its back half to an ellipsis is worse than the
 * same name set two points smaller. It gives up size down to three quarters of
 * what was asked for; past that the name is genuinely too long for the cell and
 * the ellipsis is the honest answer.
 */
function fitDown(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): { text: string; size: number } {
  let at = size;
  const floor = size * 0.75;
  while (at > floor && font.widthOfTextAtSize(text, at) > maxWidth) at -= 0.5;
  return { text: fit(text, font, at, maxWidth), size: at };
}

/** Top-left rects, like the screen. PDF space counts from the bottom. */
function flip(pageH: number, r: Rect): number {
  return pageH - r.top - r.h;
}

/**
 * The play's name, centred over its cell.
 *
 * Centred is the point: it used to be set flush against the left edge of the
 * cell, which on a 3-up row read as three plays shoved leftward rather than as
 * a row, and on a full page put the title in the corner of an otherwise
 * symmetrical sheet.
 */
function drawName(
  page: PDFPage,
  fonts: Fonts,
  text: string,
  size: number,
  box: Rect,
  pageH: number,
): void {
  const fitted = fitDown(text, fonts.bold, size, box.w);
  const w = fonts.bold.widthOfTextAtSize(fitted.text, fitted.size);
  page.drawText(fitted.text, {
    x: box.x + (box.w - w) / 2,
    // Sat on the cell's baseline, a descender in a name overlapped the board
    // below it. This centres the letters in the band they were given.
    y: flip(pageH, box) + (box.h - fitted.size) / 2 + fitted.size * 0.22,
    size: fitted.size,
    font: fonts.bold,
    color: BLACK,
  });
}

function header(
  page: PDFPage,
  fonts: Fonts,
  title: string,
  right: string | undefined,
  size = { w: PAGE.w, h: PAGE.h },
  margin = MARGIN,
): void {
  page.drawText(fit(title, fonts.bold, 13, size.w - margin * 2 - 140), {
    x: margin,
    y: size.h - margin,
    size: 13,
    font: fonts.bold,
    color: BLACK,
  });
  if (right) {
    const w = fonts.body.widthOfTextAtSize(right, 9);
    page.drawText(right, {
      x: size.w - margin - w,
      y: size.h - margin + 2,
      size: 9,
      font: fonts.body,
      color: GREY,
    });
  }
  page.drawLine({
    start: { x: margin, y: size.h - margin - 8 },
    end: { x: size.w - margin, y: size.h - margin - 8 },
    thickness: 0.7,
    color: RULE,
  });
}

/**
 * Every play the caller asked for, rasterized and embedded once.
 *
 * Embedding is what costs: the same play appearing on a call sheet and again in
 * the book would otherwise carry two copies of the image in the file. Keyed by
 * play id so a layout can place one wherever it needs to.
 */
/**
 * The plays of one page, rasterized through one shared window.
 *
 * Shared, because plays laid out side by side get compared — a coach reading a
 * split off two cells needs a yard to be a yard in both — and per page rather
 * than per document because that is exactly as far as the comparison goes.
 * Sharing across the whole document meant the single deepest play in the book
 * set the scale for every other page, so one cover-3 with a deep zone drew the
 * entire call sheet small.
 */
async function embedPage(
  doc: PDFDocument,
  plays: Play[],
  opts: SheetOptions,
  widthPx: number,
  view: View,
): Promise<Map<string, PDFImage>> {
  const out = new Map<string, PDFImage>();
  for (const play of plays) {
    if (out.has(play.id)) continue;
    const bytes = await playToPng(play, widthPx, { ...opts, forPrint: true, view });
    out.set(play.id, await doc.embedPng(bytes));
  }
  return out;
}

async function startDoc(): Promise<{ doc: PDFDocument; fonts: Fonts }> {
  const doc = await PDFDocument.create();
  return {
    doc,
    fonts: {
      body: await doc.embedFont(StandardFonts.Helvetica),
      bold: await doc.embedFont(StandardFonts.HelveticaBold),
    },
  };
}

export interface SheetMeta {
  /** The running head on a page that holds more than one play. */
  title?: string;
  /** Names the men in the slots, when the notes are being printed. */
  roster?: RosterEntry[];
  /** The folder a play is in, for the running head of a full playbook. */
  folderOf?: (play: Play) => string | undefined;
}

/**
 * Plays onto paper, however the coach asked for them.
 *
 * The one composer. There used to be four of these — an install sheet, a call
 * sheet, big-print cards and the playbook — each with its own copy of the page
 * arithmetic and its own fixed idea of the paper, which is why none of them
 * could be turned sideways and only one of them centred anything. They differ
 * in nothing but their options now, and the arithmetic they share lives in
 * `paper.ts`, where the preview can read it too.
 */
export async function playSheetPdf(
  plays: Play[],
  opts: PrintOptions = DEFAULT_PRINT,
  meta: SheetMeta = {},
): Promise<Uint8Array> {
  const { doc, fonts } = await startDoc();
  // The grid is chosen knowing roughly what shape the boards will be, which now
  // depends on the plays rather than on a fixed window.
  const L = layout(opts, contentAspect(plays));
  const board = L.cells[0].board;
  const total = L.pages(plays.length);

  for (let i = 0, p = 0; i < Math.max(plays.length, 1); i += opts.perPage, p++) {
    const page = doc.addPage([L.page.w, L.page.h]);
    const here = plays.slice(i, i + opts.perPage);
    const view = viewForPlays(here, board.w / board.h);
    const shots = await embedPage(doc, here, opts, rasterFor(board.w), view);

    if (L.head) {
      // On a full playbook the folder is the running head, because a binder is
      // thumbed through and a header on every sheet is findable in a way a
      // divider two pages back is not. Otherwise it is the sheet's own name.
      const folder = here[0] && meta.folderOf?.(here[0]);
      header(
        page,
        fonts,
        folder ?? meta.title ?? 'Chalk',
        total > 1 ? `${p + 1} / ${total}` : undefined,
        L.page,
        L.margin,
      );
    }

    here.forEach((play, n) => {
      const cell = L.cells[n];
      drawName(page, fonts, playTitle(play), cell.nameSize, cell.name, L.page.h);

      const shot = shots.get(play.id);
      if (shot) {
        const at = centreIn(cell.board, view.w / view.h);
        page.drawImage(shot, {
          x: at.x,
          y: flip(L.page.h, at),
          width: at.w,
          height: at.h,
        });
      }
    });

    // Who is in it and what to say about it. One play to a page only: there is
    // nowhere to put this on a grid, and a call sheet is read at a glance.
    if (L.notes && here[0]) {
      const play = here[0];
      const lines = [
        play.coachingPoint,
        play.notes,
        meta.roster?.length ? describePersonnel(play.players, meta.roster) : '',
        play.tags.join(' · '),
      ].filter(Boolean);

      let y = flip(L.page.h, L.notes) + L.notes.h - 11;
      for (const line of lines.slice(0, 4)) {
        page.drawText(fit(line, fonts.body, 10, L.notes.w), {
          x: L.notes.x,
          y,
          size: 10,
          font: fonts.body,
          color: BLACK,
        });
        y -= 13;
      }
    }
  }

  return doc.save();
}


/**
 * Wristband strips: names only, in columns sized to a quarterback's forearm.
 *
 * No diagrams, and no orientation to choose. A wristband is read in two seconds
 * with a hand on a centre's back, so it carries the number and the name and
 * nothing that needs looking at.
 */
export async function wristbandPdf(
  plays: Play[],
  title: string,
  perStrip = 15,
): Promise<Uint8Array> {
  const { doc, fonts } = await startDoc();
  const page = doc.addPage([PAGE.w, PAGE.h]);
  header(page, fonts, `${title} — wristband`, `${plays.length} plays`);

  const stripW = 150;
  const gutter = 18;
  const perRow = Math.floor((PAGE.w - MARGIN * 2 + gutter) / (stripW + gutter));
  const rowH = 18 + perStrip * 15;

  for (let s = 0; s * perStrip < plays.length; s++) {
    const col = s % perRow;
    const row = Math.floor(s / perRow);
    const x = MARGIN + col * (stripW + gutter);
    const yTop = PAGE.h - MARGIN - 30 - row * (rowH + gutter);

    page.drawRectangle({
      x,
      y: yTop - rowH,
      width: stripW,
      height: rowH,
      borderColor: RULE,
      borderWidth: 0.8,
    });

    plays.slice(s * perStrip, (s + 1) * perStrip).forEach((play, n) => {
      const y = yTop - 22 - n * 15;
      page.drawText(`${s * perStrip + n + 1}`, {
        x: x + 7,
        y,
        size: 8,
        font: fonts.body,
        color: GREY,
      });
      page.drawText(fit(playTitle(play), fonts.bold, 9.5, stripW - 32), {
        x: x + 24,
        y,
        size: 9.5,
        font: fonts.bold,
        color: BLACK,
      });
    });
  }

  return doc.save();
}

/**
 * The team sheet: numbers, names and what each kid can play.
 *
 * Ruled rows rather than a bare list, because this is the page that gets
 * clipped to a board and written on during a game.
 */
export async function rosterPdf(roster: RosterEntry[], title = 'Roster'): Promise<Uint8Array> {
  const { doc, fonts } = await startDoc();
  const page = doc.addPage([PAGE.w, PAGE.h]);
  header(page, fonts, title, `${roster.length} players`);

  const rowH = 22;
  let y = PAGE.h - MARGIN - 44;

  for (const entry of byJersey(roster)) {
    if (y < MARGIN) break;

    page.drawText(String(entry.jersey), {
      x: MARGIN,
      y,
      size: 13,
      font: fonts.bold,
      color: BLACK,
    });
    page.drawText(fit(entry.name || '—', fonts.body, 12, 280), {
      x: MARGIN + 42,
      y,
      size: 12,
      font: fonts.body,
      color: BLACK,
    });
    page.drawText(fit(entry.positions.join(' · '), fonts.body, 10, 150), {
      x: MARGIN + 340,
      y: y + 1,
      size: 10,
      font: fonts.body,
      color: GREY,
    });
    page.drawLine({
      start: { x: MARGIN, y: y - 7 },
      end: { x: PAGE.w - MARGIN, y: y - 7 },
      thickness: 0.5,
      color: RULE,
    });
    y -= rowH;
  }

  return doc.save();
}
