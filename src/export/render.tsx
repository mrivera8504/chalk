import { renderToStaticMarkup } from 'react-dom/server';
import { autoRouteColor } from '../domain/colors';
import { computeHoles } from '../domain/holes';
import { quarterback, type Play } from '../domain/types';
import { getSettings } from '../store/settings';
import { AssignmentPath } from '../render/AssignmentPath';
import { Field } from '../render/Field';
import { FocusSquare } from '../render/FocusSquare';
import { PlayerShape } from '../render/PlayerShape';
import { VisionCone } from '../render/VisionCone';
import { VIEW, VIEW_BOX, toPathD } from '../render/geometry';

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
  '--chalk',
  '--select',
  '--hover',
  '--locked',
  '--ball',
  '--ball-line',
  '--jersey',
  '--vision',
  '--focus',
];

function tokenBlock(): string {
  const cs = getComputedStyle(document.documentElement);
  const pairs = TOKENS.map((t) => `${t}:${cs.getPropertyValue(t).trim()}`).join(';');
  return `:root{${pairs}}`;
}

export interface SheetOptions {
  /** Hole numbers are for install; a call sheet reads better without them. */
  showHoles?: boolean;
  /** The scout look. Off by default: most plays are drawn offense-only. */
  showDefense?: boolean;
  /** Paper is white, so the turf goes pale and the marks go dark. */
  forPrint?: boolean;
}

/**
 * Print turf.
 *
 * A call sheet gets photocopied, rained on and read at arm's length on a
 * sideline, and the dark board that works on a screen at night turns into a
 * solid block of toner. These override the screen tokens for anything headed
 * to paper: white field, black marks, grey yard lines.
 */
const PRINT_TOKENS =
  '--turf:#ffffff;--turf-line:rgba(0,0,0,0.16);--los:rgba(0,0,0,0.55);' +
  '--hole:rgba(0,0,0,0.45);--off-fill:#ffffff;--off-line:#000000;' +
  '--off-text:#000000;--def-fill:rgba(255,255,255,0.9);--def-line:#000000;' +
  '--def-text:#000000;--chalk:#000000;' +
  // The screen palette is pastel because it sits on dark turf. On white it
  // disappears, so every ink goes to a saturated version of the same hue: the
  // receiver you could tell apart by colour on the board is the same colour,
  // still distinguishable, on the sheet.
  '--ink-carry:#c2410c;--ink-block:#a16207;--ink-motion:#6d28d9;' +
  '--ink-option:#475569;--ball:#000000;--ball-line:#ffffff;--jersey:#334155;' +
  '--route-0:#0369a1;--route-1:#15803d;' +
  '--route-2:#6d28d9;--route-3:#be185d;--route-4:#4d7c0f;--route-5:#0f766e;' +
  // The highlights go grey on paper. They are laid under the play at a tenth
  // of their alpha, and a yellow wash that reads on dark turf prints as either
  // nothing at all or a stain across the routes drawn over it.
  '--vision:#1f2937;--focus:#1f2937';

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
  const qb = quarterback(play.players);
  const focused = (play.focuses ?? []).flatMap((f) => {
    const man = play.players.find((p) => p.id === f.playerId);
    return man ? [{ man, focus: f }] : [];
  });
  const players = opts.showDefense
    ? play.players
    : play.players.filter((p) => p.side === 'offense');

  const body = renderToStaticMarkup(
    <>
      <Field holes={holes} showHoles={opts.showHoles ?? false} />
      {/* Under everything, exactly as on the board. */}
      {focused.map(({ man, focus }) => (
        <FocusSquare key={`focus${man.id}`} player={man} focus={focus} />
      ))}
      {play.vision && qb && <VisionCone qb={qb} vision={play.vision} />}
      {play.annotations.map((path, i) => (
        <path
          key={`ann${i}`}
          d={toPathD(path)}
          fill="none"
          stroke="var(--chalk)"
          strokeWidth={path[0]?.w ?? 0.14}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.75}
        />
      ))}
      {play.assignments.map((a) => (
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

  const style = opts.forPrint ? `${tokenBlock()}:root{${PRINT_TOKENS}}` : tokenBlock();

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW_BOX}" ` +
    `width="${VIEW.halfWidth * 2}" height="${VIEW.downfield + VIEW.behind}">` +
    `<style>${style}</style>${body}</svg>`
  );
}

/** The board's aspect, so every caller sizes pages from one number. */
export const BOARD_ASPECT = (VIEW.halfWidth * 2) / (VIEW.downfield + VIEW.behind);

/**
 * Rasterize an SVG string at an exact pixel width.
 *
 * Through an <img> and a canvas rather than a library: the browser already has
 * the only SVG renderer this app will ever need, and it is the same one that
 * drew the board. Encoded as a data URL because a blob URL would have to be
 * revoked on a path that can throw.
 */
export async function svgToPng(svg: string, widthPx: number): Promise<Uint8Array> {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(widthPx);
  canvas.height = Math.round(widthPx / BOARD_ASPECT);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser would not give up a 2D canvas.');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('The board would not encode as a PNG.');
  return new Uint8Array(await blob.arrayBuffer());
}

export function playToPng(play: Play, widthPx: number, opts: SheetOptions = {}) {
  return svgToPng(playToSvg(play, opts), widthPx);
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
