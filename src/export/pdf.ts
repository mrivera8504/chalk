import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib';
import { byJersey, describePersonnel, type RosterEntry } from '../domain/roster';
import { type Play, type Section } from '../domain/types';
import { BOARD_ASPECT, playToPng, playTitle, type SheetOptions } from './render';

/** Points. Letter portrait, the one size every coach's printer has. */
const PAGE = { w: 612, h: 792 };
const MARGIN = 40;

/**
 * Raster width for an embedded diagram, in pixels.
 *
 * A play never exceeds half a page wide, about 260pt, and 300 DPI on 260pt is
 * roughly 1080px. Everything is drawn at that width whatever cell it lands in,
 * because the cost is one rasterize per play and the alternative is a call
 * sheet that looks soft next to a full-page card.
 */
const RASTER_PX = 1080;

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

function header(page: PDFPage, fonts: Fonts, title: string, right?: string): void {
  page.drawText(fit(title, fonts.bold, 13, PAGE.w - MARGIN * 2 - 140), {
    x: MARGIN,
    y: PAGE.h - MARGIN,
    size: 13,
    font: fonts.bold,
    color: BLACK,
  });
  if (right) {
    const w = fonts.body.widthOfTextAtSize(right, 9);
    page.drawText(right, {
      x: PAGE.w - MARGIN - w,
      y: PAGE.h - MARGIN + 2,
      size: 9,
      font: fonts.body,
      color: GREY,
    });
  }
  page.drawLine({
    start: { x: MARGIN, y: PAGE.h - MARGIN - 8 },
    end: { x: PAGE.w - MARGIN, y: PAGE.h - MARGIN - 8 },
    thickness: 0.7,
    color: RULE,
  });
}

/**
 * Fit a diagram inside a box, keeping the board's proportions.
 *
 * The board is taller than it is wide, so a cell sized by its width usually has
 * height to spare and a cell sized by its height has width to spare. Whichever
 * runs out first decides, and the result is centred in what is left.
 */
function boxFit(bw: number, bh: number) {
  const w = Math.min(bw, bh * BOARD_ASPECT);
  return { w, h: w / BOARD_ASPECT };
}

/**
 * Every play the caller asked for, rasterized and embedded once.
 *
 * Embedding is what costs: the same play appearing on a call sheet and again in
 * the book would otherwise carry two copies of the image in the file. Keyed by
 * play id so a layout can place one wherever it needs to.
 */
async function embedAll(
  doc: PDFDocument,
  plays: Play[],
  opts: SheetOptions,
): Promise<Map<string, PDFImage>> {
  const out = new Map<string, PDFImage>();
  for (const play of plays) {
    const bytes = await playToPng(play, RASTER_PX, { ...opts, forPrint: true });
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

/**
 * One play to a page, the diagram as large as the paper allows.
 *
 * This is the install sheet and the thing that gets handed to a coach who was
 * not at practice, so it carries the notes and the coaching point. Holes are on
 * by default here and off on a call sheet, because this is where they are
 * taught.
 */
export async function singlePlayPdf(
  play: Play,
  opts: SheetOptions = {},
  roster: RosterEntry[] = [],
): Promise<Uint8Array> {
  const { doc, fonts } = await startDoc();
  const png = await doc.embedPng(await playToPng(play, RASTER_PX, { ...opts, forPrint: true }));
  const page = doc.addPage([PAGE.w, PAGE.h]);

  header(page, fonts, playTitle(play), play.tags.join(' · '));

  // Who is in it, when the slots have been filled in. This is the sheet that
  // gets handed to a coach who missed practice, so the names earn their line.
  const personnel = describePersonnel(play.players, roster);
  const notes = [play.coachingPoint, play.notes, personnel].filter(Boolean);
  const notesRoom = notes.length ? 26 + notes.length * 13 : 0;
  const top = PAGE.h - MARGIN - 28;
  const bottom = MARGIN + notesRoom;
  const box = boxFit(PAGE.w - MARGIN * 2, top - bottom);

  page.drawImage(png, {
    x: (PAGE.w - box.w) / 2,
    y: bottom + (top - bottom - box.h) / 2,
    width: box.w,
    height: box.h,
  });

  let y = MARGIN + notesRoom - 26;
  for (const line of notes) {
    page.drawText(fit(line, fonts.body, 10, PAGE.w - MARGIN * 2), {
      x: MARGIN,
      y,
      size: 10,
      font: fonts.body,
      color: BLACK,
    });
    y -= 13;
  }

  return doc.save();
}

/**
 * The call sheet: a grid of plays, per page, named and nothing else.
 *
 * Four, six or nine, because those are the grids that stay legible at arm's
 * length. Hole numbers come off unless asked for: on a Friday night the name is
 * the only thing being read.
 */
export async function callSheetPdf(
  plays: Play[],
  perPage: 4 | 6 | 9,
  title: string,
  opts: SheetOptions = {},
): Promise<Uint8Array> {
  const { doc, fonts } = await startDoc();
  const shots = await embedAll(doc, plays, opts);

  const cols = perPage === 4 ? 2 : perPage === 6 ? 2 : 3;
  const rows = perPage / cols;
  const gutter = 14;
  const top = PAGE.h - MARGIN - 26;
  const gridH = top - MARGIN;
  const cellW = (PAGE.w - MARGIN * 2 - gutter * (cols - 1)) / cols;
  const cellH = (gridH - gutter * (rows - 1)) / rows;
  const LABEL = 15;

  for (let i = 0; i < plays.length; i += perPage) {
    const page = doc.addPage([PAGE.w, PAGE.h]);
    header(page, fonts, title, `${Math.floor(i / perPage) + 1}`);

    plays.slice(i, i + perPage).forEach((play, n) => {
      const cx = MARGIN + (n % cols) * (cellW + gutter);
      const cy = top - Math.floor(n / cols) * (cellH + gutter) - cellH;
      const box = boxFit(cellW, cellH - LABEL);

      page.drawText(fit(playTitle(play), fonts.bold, 10, cellW), {
        x: cx,
        y: cy + cellH - 10,
        size: 10,
        font: fonts.bold,
        color: BLACK,
      });

      const shot = shots.get(play.id);
      if (shot) {
        page.drawImage(shot, {
          x: cx + (cellW - box.w) / 2,
          y: cy,
          width: box.w,
          height: box.h,
        });
      }
    });
  }

  return doc.save();
}

/**
 * Wristband strips: names only, in columns sized to a quarterback's forearm.
 *
 * No diagrams. A wristband is read in two seconds with a hand on a centre's
 * back, so it carries the number and the name and nothing that needs looking at.
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
 * Big-print player cards: one play a page, name enormous, no notes.
 *
 * For the kid who has to recognise it, not the coach who has to teach it.
 */
export async function playerCardsPdf(
  plays: Play[],
  opts: SheetOptions = {},
): Promise<Uint8Array> {
  const { doc, fonts } = await startDoc();
  const shots = await embedAll(doc, plays, opts);

  for (const play of plays) {
    const page = doc.addPage([PAGE.w, PAGE.h]);
    const name = fit(playTitle(play).toUpperCase(), fonts.bold, 30, PAGE.w - MARGIN * 2);
    const w = fonts.bold.widthOfTextAtSize(name, 30);

    page.drawText(name, {
      x: (PAGE.w - w) / 2,
      y: PAGE.h - MARGIN - 24,
      size: 30,
      font: fonts.bold,
      color: BLACK,
    });

    const shot = shots.get(play.id);
    if (!shot) continue;
    const box = boxFit(PAGE.w - MARGIN * 2, PAGE.h - MARGIN * 2 - 60);
    page.drawImage(shot, {
      x: (PAGE.w - box.w) / 2,
      y: MARGIN,
      width: box.w,
      height: box.h,
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

/**
 * The whole playbook, in folder order, one play a page.
 *
 * Folders become the running header rather than their own divider pages: a
 * binder is thumbed through, and a header on every sheet is findable in a way
 * that a divider two pages back is not.
 */
export async function playbookPdf(
  plays: Play[],
  sections: Section[],
  opts: SheetOptions = {},
): Promise<Uint8Array> {
  const { doc, fonts } = await startDoc();
  const order = [...sections].sort((a, b) => a.order - b.order);
  const name = new Map(order.map((s) => [s.id, s.name]));

  const sorted = [
    ...order.flatMap((s) => plays.filter((p) => p.sectionId === s.id)),
    ...plays.filter((p) => !name.has(p.sectionId)),
  ];
  const shots = await embedAll(doc, sorted, opts);

  for (const play of sorted) {
    const page = doc.addPage([PAGE.w, PAGE.h]);
    header(page, fonts, playTitle(play), name.get(play.sectionId) ?? 'Unfiled');

    const shot = shots.get(play.id);
    if (!shot) continue;
    const box = boxFit(PAGE.w - MARGIN * 2, PAGE.h - MARGIN * 2 - 40);
    page.drawImage(shot, {
      x: (PAGE.w - box.w) / 2,
      y: MARGIN + (PAGE.h - MARGIN * 2 - 40 - box.h) / 2,
      width: box.w,
      height: box.h,
    });
  }

  return doc.save();
}
