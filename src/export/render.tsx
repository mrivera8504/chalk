import { renderToStaticMarkup } from 'react-dom/server';
import { autoRouteColor } from '../domain/colors';
import { computeGaps } from '../domain/gaps';
import { computeHoles } from '../domain/holes';
import { refreshPaths } from '../domain/regenerate';
import { drawnSides, playSurface, quarterback, type Play } from '../domain/types';
import { getSettings } from '../store/settings';
import { AssignmentPath } from '../render/AssignmentPath';
import { Field } from '../render/Field';
import { FocusSquare } from '../render/FocusSquare';
import { ZoneArea } from '../render/Zone';
import { PlayerShape } from '../render/PlayerShape';
import { VisionCone } from '../render/VisionCone';
import { toPathD } from '../render/geometry';
import { BOARD_ASPECT } from './paper';
import { DEFAULT_VIEW, viewBox, type View } from './view';
import { paperCss } from '../ui/surface';

/**
 * The tokens the board renderers actually reference.
 *
 * Listed rather than discovered. A serialized SVG carries no stylesheet with
 * it, so every custom property has to be written into the file itself, and a
 * token that silently failed to resolve would export as black on black with
 * nothing to show for it. If a renderer starts using a new token, add it here;
 * `grep -ho 'var(--[a-z-]*)' src/render/*.tsx` lists them.
 */
const TOKENS = [
  '--route-0',
  '--route-1',
  '--route-2',
  '--route-3',
  '--route-4',
  '--route-5',
  '--turf',
  '--turf-line',
  '--los',
  '--hole',
  '--off-fill',
  '--off-line',
  '--off-text',
  '--def-fill',
  '--def-line',
  '--def-text',
  '--ink-block',
  '--ink-route',
  '--ink-carry',
  '--ink-motion',
  '--ink-option',
  '--ink-blitz',
  '--ink-cover',
  /* The board's own chalk — annotations and route handles. Not the UI's
     `--chalk`, which is the color of text in the panels and never drawn. */
  '--board-chalk',
  '--select',
  '--hover',
  '--locked',
  '--ball',
  '--ball-line',
  '--jersey',
  '--vision',
  '--focus',
  '--zone',
];

function tokenBlock(): string {
  const cs = getComputedStyle(document.documentElement);
  const pairs = TOKENS.map((t) => `${t}:${cs.getPropertyValue(t).trim()}`).join(';');
  return `:root{${pairs}}`;
}

export interface SheetOptions {
  /** Hole numbers are for install; a call sheet reads better without them. */
  showHoles?: boolean;
  /*
   * There is deliberately no option here for either side of the ball. Which
   * men are drawn is set on the board and stored on the play — see
   * `drawnSides` — so a sheet renders the play the coach actually made rather
   * than asking the question a second time and getting a different answer.
   */
  /** The gap letters, the defensive half of the hole map. */
  showGaps?: boolean;
  /** Paper is white, so the turf goes pale and the marks go dark. */
  forPrint?: boolean;
  /**
   * How much of the field to show, in yards.
   *
   * The board's own 22-by-30 window unless a sheet says otherwise. A printed
   * sheet works it out from the plays and the shape of the paper, so a
   * landscape page gets a landscape window rather than a tall board with white
   * either side of it; see `view.ts`.
   */
  view?: View;
}

/*
 * The paper palette — the structural half set by hand, the ink half derived
 * from whatever the coach chose — lives in `ui/surface.ts`, because the white
 * board on screen is drawn with the very same palette. See the note there on
 * why there is one of it and not two.
 */

/**
 * One play as a standalone SVG document.
 *
 * Built from the same components the editor draws with, so an export can never
 * drift from what was on the board. The viewBox is in yards exactly as on
 * screen, which is the whole point of never storing pixels: this one string
 * serves a thumbnail and a 300 DPI sheet without any of it being redrawn.
 */
export function playToSvg(play: Play, opts: SheetOptions = {}): string {
  /*
   * The live rules, not the frozen defaults. The league settings are real
   * settings now, so a sheet built from DEFAULT_SETTINGS numbered the holes the
   * way the app shipped rather than the way this team plays — the same mistake
   * the editor's stale useMemo arrays made.
   */
  const holes = computeHoles(play.players, getSettings());
  const gaps = computeGaps(play.players);
  const qb = quarterback(play.players);
  /*
   * Read off the play, never off the sheet's options: the coach settled this on
   * the board, and a sheet printed months later from a folder list has no idea
   * what was decided there unless the play says so.
   */
  const sides = drawnSides(play, getSettings().showDefense);
  const players = play.players.filter((p) => (p.side === 'defense' ? sides.defense : sides.offense));

  /*
   * Regenerated from every player and only then filtered down to the men who
   * are drawn, exactly as the editor does it: a block and a cover rope are
   * stored as relationships, so rebuilding them from a half-empty roster would
   * redraw them to the wrong place rather than leave them out.
   */
  const lines = refreshPaths(play.assignments, play.players).filter((a) =>
    players.some((p) => p.id === a.playerId),
  );

  /* Both washes hang off a man, so neither outlives the one it comes off. */
  const focused = (play.focuses ?? []).flatMap((f) => {
    const man = players.find((p) => p.id === f.playerId);
    return man ? [{ man, focus: f }] : [];
  });

  const view = opts.view ?? DEFAULT_VIEW;

  const body = renderToStaticMarkup(
    <>
      <Field
        holes={holes}
        showHoles={opts.showHoles ?? false}
        gaps={gaps}
        showGaps={opts.showGaps ?? false}
        view={view}
      />
      {/* Under everything, exactly as on the board. */}
      {(play.zones ?? []).map((z) => (
        <ZoneArea
          key={`zone${z.playerId}`}
          zone={z}
          player={play.players.find((p) => p.id === z.playerId) ?? null}
        />
      ))}
      {focused.map(({ man, focus }) => (
        <FocusSquare key={`focus${man.id}`} player={man} focus={focus} />
      ))}
      {play.vision && qb && sides.offense && <VisionCone qb={qb} vision={play.vision} />}
      {play.annotations.map((path, i) => (
        <path
          key={`ann${i}`}
          d={toPathD(path)}
          fill="none"
          stroke="var(--board-chalk)"
          strokeWidth={path[0]?.w ?? 0.14}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.75}
        />
      ))}
      {/* Regenerated from the players, as the board draws them: a block, a
          cover rope and a stunt are stored as relationships, never as lines. */}
      {lines.map((a) => (
        <AssignmentPath key={a.id} assignment={a} autoColor={autoRouteColor(a, play.players)} />
      ))}
      {players.map((p) => (
        <PlayerShape
          key={p.id}
          player={p}
          selected={false}
          ball={p.id === play.ballCarrierId}
        />
      ))}
    </>,
  );

  /*
   * Paper, or a board this play is drawn white on: the same palette either way,
   * so a PNG shared out of the app matches the board it came off and a sheet is
   * unchanged from what was confirmed on a printer. Read off the play through
   * the same rule the board and the card use, never off the sheet's options —
   * a sheet that asked the question a second time is how the printer and the
   * board came to disagree about the front.
   */
  const onPaper = opts.forPrint || playSurface(play, getSettings().fieldSurface) === 'white';
  const style = onPaper ? `${tokenBlock()}:root{${paperCss()}}` : tokenBlock();

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox(view)}" ` +
    `width="${view.w}" height="${view.h}">` +
    `<style>${style}</style>${body}</svg>`
  );
}

/**
 * The board's aspect, so every caller sizes pages from one number.
 *
 * Lives with the rest of the page arithmetic in `paper.ts`; re-exported here
 * for the callers that only ever wanted this one number out of it.
 */
export { BOARD_ASPECT };

/**
 * Rasterize an SVG string at an exact pixel width.
 *
 * Through an <img> and a canvas rather than a library: the browser already has
 * the only SVG renderer this app will ever need, and it is the same one that
 * drew the board. Encoded as a data URL because a blob URL would have to be
 * revoked on a path that can throw.
 */
export async function svgToPng(
  svg: string,
  widthPx: number,
  aspect = BOARD_ASPECT,
): Promise<Uint8Array> {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(widthPx);
  canvas.height = Math.round(widthPx / aspect);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser would not give up a 2D canvas.');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('The board would not encode as a PNG.');
  return new Uint8Array(await blob.arrayBuffer());
}

export function playToPng(play: Play, widthPx: number, opts: SheetOptions = {}) {
  // The canvas has to match the window, not the board's old fixed shape, or a
  // landscape sheet is squeezed back into a portrait raster on its way out.
  const view = opts.view ?? DEFAULT_VIEW;
  return svgToPng(playToSvg(play, opts), widthPx, view.w / view.h);
}

/** What a play is called on paper: the name if it has one, else the suggestion. */
export function playTitle(play: Play): string {
  return play.name || play.suggestedName || 'Untitled';
}

/**
 * Hand a file to the user.
 *
 * Same shape as the JSON backup already used in App.tsx, and for the same
 * reason: the account is anonymous and tied to this browser's storage, so the
 * only durable copy of anything is one that lands in their downloads.
 */
export function download(bytes: Uint8Array | string, filename: string, type: string): void {
  const blob = new Blob([bytes as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * A play's name, fit to be a filename.
 *
 * Lowercased, punctuation collapsed to hyphens, and capped — a coach who names
 * a play after the whole call gets a readable file rather than a paragraph with
 * an extension on the end. Falls back rather than returning nothing, because a
 * file called `-2026-09-17.pdf` is worse than one called `untitled`.
 */
export function slug(text: string, fallback = 'untitled'): string {
  const out = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
    .replace(/-$/, '');
  return out || fallback;
}

/**
 * What a sheet is called when it lands in the coach's downloads.
 *
 * Every sheet used to be `chalk-plays-<date>.pdf`, so a coach printing three
 * things in an evening got that name and then two copies of it with numbers in
 * brackets, and no way to tell which was which without opening all three. The
 * name now says what is in it: one play is called after the play, a folder
 * after the folder, and a grid says how many are to a page.
 */
export function sheetName(opts: {
  plays: Play[];
  perPage: number;
  /** Set when every play on the sheet came out of the same folder. */
  folder?: string;
}): string {
  const { plays, perPage, folder } = opts;

  const subject =
    plays.length === 1
      ? slug(playTitle(plays[0]))
      : folder
        ? `${slug(folder, 'unfiled')}-${plays.length}-plays`
        : `playbook-${plays.length}-plays`;

  // A grid is a different sheet from the same plays, so it says so — otherwise
  // a call sheet and an install sheet of one folder collide on the same day.
  const shape = perPage > 1 ? `-${perPage}up` : '';
  return `${subject}${shape}-${stamp()}.pdf`;
}
