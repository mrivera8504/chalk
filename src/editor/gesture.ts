import type { Frame } from '../domain/frames';
import type { BoardMark } from '../domain/marks';
import { PLAYER_R, type Assignment, type Focus, type PathPoint, type PlayerSlot, type Vision, type Zone } from '../domain/types';
import { VIEW, clamp, snap, snapDepth, type Yards } from '../render/geometry';

/**
 * What the editor knows about a gesture, apart from the editor.
 *
 * The numbers every pointer decision is made with, the shape of a thing in
 * hand, and the decisions themselves wherever they can be made from plain
 * values. Lifted out of `PlayEditor.tsx` so they can be tested without a board:
 * each constant here was set from a device trace, and each rule is one a past
 * bug was fixed by.
 */

/*
 * Measured from a real S Pen trace: bounce gaps ran 10-25ms, while a genuine
 * second tap was never under 200ms. The window sits well clear of both.
 */
export const CHATTER_MS = 120;
export const CHATTER_YARDS = 2.5;

/*
 * A pen wobbles while it is in contact, so without a threshold every tap drags
 * the player a little. In the device trace a 103ms tap moved a guard more than
 * a yard and a half, far enough that the next tap at the same spot found empty
 * grass. Nothing moves until the pen has travelled this far, in screen pixels.
 */
export const DRAG_SLOP_PX = 12;

/** How near a route handle a tap has to land, in yards. The zone grip's reach. */
export const ROUTE_GRAB = 1.1;

/** Freehand tolerance, in yards. Roughly a tenth of a player's width. */
export const INK_TOLERANCE = 0.15;

/**
 * A stroke ends when the pen goes quiet, not when it lifts.
 *
 * This digitizer reports contact for three to five milliseconds at a time
 * unless the pen is pressed hard, so a stroke that needs held pressure cannot
 * be drawn. Hover, by contrast, tracks perfectly: every trace carries hundreds
 * of clean hover samples at zero pressure. So contact is used only to start and
 * finish, and the shape in between is taken from wherever the pen goes.
 */
export const INK_IDLE_MS = 700;

/**
 * A stroke has to actually go somewhere. Contact bounce delivers two samples a
 * few milliseconds apart, which is enough to satisfy a bare length check and
 * commit a stub that then displaces a real route.
 */
export const INK_MIN_SPAN = 0.8;

/**
 * How close a stroke must begin to a player to be counted as his route, rather
 * than free annotation. Deliberately far tighter than the tap radius: that one
 * is generous so a pen can select at all, but at 2.46 yards everything below
 * the line of scrimmage falls inside somebody's claim, and since a player keeps
 * only one drawn route, every new stroke silently deleted the last.
 */
export const INK_OWNER_YARDS = PLAYER_R * 1.6;

export type Selection = { kind: 'player' | 'assignment'; id: string } | null;

/**
 * A sentinel id for the cone, which has none of its own — there is at most one
 * on a play. Player ids are minted with a prefix, so it can never collide, and
 * `byId` returns null for it without being taught anything. A focus square has
 * no sentinel: it is one per man, so it is carried by its own player's id.
 */
export const VISION_ID = '::vision';

/**
 * The same trick for the board itself, which is not a thing on the play at all.
 * Panning goes through `applyDrag` like everything else that moves, so it needs
 * an id to be carried by, and this one belongs to no player either.
 */
export const PAN_ID = '::pan';

export interface DragState {
  /**
   * What is in hand. `id` is the player for a drag, for a focus square and for
   * a zone — the man each belongs to — and the sentinel for the cone.
   *
   * A zone is the only thing here with two grabs. Its body moves it and its far
   * corner sizes it, which the cone and the square do not need because for them
   * aiming and sizing are the same gesture. A coverage has to be aimed and
   * sized separately: a flat is shallow and wide wherever it is.
   */
  kind: 'player' | 'vision' | 'focus' | 'zone' | 'zone-size' | 'pan' | 'route-point' | 'mark';
  /** The assignment, for a route point. */
  id: string;
  /** Which point of the route is in hand. Only a route point has one. */
  pt?: number;
  /** Grab offset, so the mark keeps its position relative to the pen. */
  dx: number;
  dy: number;
  /** Where the grab began, for measuring travel against the slop. */
  ox: number;
  oy: number;
  /** True once the pen has travelled far enough that this is a drag, not a tap. */
  moved: boolean;
}

/** Everything undo has to restore. Formations and tools are not part of a play. */
export interface Snapshot {
  players: PlayerSlot[];
  assignments: Assignment[];
  annotations: PathPoint[][];
  ballCarrierId: string | null;
  vision: Vision | null;
  focuses: Focus[];
  zones: Zone[];
  marks: BoardMark[];
  /**
   * Which step was on the board, and every step as it stood. So undo reaches
   * across steps: stepping back over an edit made on step 2 puts step 2 back
   * on the board first, and adding or removing a step is one step back too.
   */
  step?: number;
  steps?: Frame[];
}

/** A drag that just ended, kept for a moment in case the pen only bounced. */
export type Drop = DragState & { at: number; x: number; y: number };

/**
 * Whether a new contact is the last one continuing, rather than a fresh tap.
 *
 * The S Pen breaks contact constantly: one deliberate press arrived as five
 * pointerdown/pointerup pairs inside 150ms. A contact close in time and space
 * to a drag that just ended is that drag resuming. Both halves matter — near in
 * time but across the field is a second hand, and near in space but late is a
 * second tap.
 */
export function isContactBounce(drop: Drop | null, now: number, at: Yards): drop is Drop {
  return (
    !!drop &&
    now - drop.at < CHATTER_MS &&
    Math.hypot(drop.x - at.x, drop.y - at.y) < CHATTER_YARDS
  );
}

/** Whether the pen has travelled far enough from the grab to be a drag. */
export function beyondSlop(d: DragState, at: Yards, slopYards: number): boolean {
  return Math.hypot(at.x - d.ox, at.y - d.oy) >= slopYards;
}

export interface SnapRules {
  /** The grid, in yards. */
  step: number;
  /** How near the line an offensive man clicks onto it. Zero for anyone else. */
  magnet: number;
}

/**
 * Where the thing in hand lands for a pen at `at`: the grab offset kept, the
 * grid and the line magnet applied, and the result held on the board.
 *
 * A man is kept a yard inside the board so his mark and his number stay on it.
 * A zone's corner is not a man: a deep third is a third of the field, and
 * stopping its corner a yard short of the sideline meant the widest zone the
 * coverage tool draws could not be redrawn at the width it was given.
 *
 * Only a player is magnetised. The line of scrimmage means nothing to where a
 * quarterback is looking, nor to the patch of grass a receiver is working into.
 */
export function dragTarget(
  d: DragState,
  at: Yards,
  rules: SnapRules,
  /** The board's window: a field's unless the play is on a court. */
  view: typeof VIEW = VIEW,
): Yards {
  const edge = d.kind === 'zone-size' ? 0 : 1;
  return {
    x: clamp(snap(at.x + d.dx, rules.step), -view.halfWidth + edge, view.halfWidth - edge),
    y: clamp(
      snapDepth(at.y + d.dy, d.kind === 'player' ? rules.magnet : 0, rules.step),
      -view.downfield + edge,
      view.behind - edge,
    ),
  };
}

/**
 * The board's offset for a pan, from where the grab began and how far the pen
 * has gone across the glass since.
 *
 * In pixels, and absolute. A pan is a change to the very matrix every other
 * drag reads its target from, so yards taken from it chase their own tail; pen
 * travel across the glass is the quantity that stays still underneath. Clamped
 * so the middle of the view stays over the field: a board you can slide off the
 * screen entirely is a board you can lose.
 */
export function panOffset(
  from: { x: number; y: number; ox: number; oy: number },
  client: { x: number; y: number },
  /** Pixels per yard, across and down, off the SVG's own matrix. */
  scale: { a: number; d: number },
  view: typeof VIEW = VIEW,
): Yards {
  const half = { x: view.halfWidth, y: (view.downfield + view.behind) / 2 };
  return {
    // Drag right and the field goes right, which means the window goes left.
    x: clamp(from.ox - (client.x - from.x) / scale.a, -half.x, half.x),
    y: clamp(from.oy - (client.y - from.y) / scale.d, -half.y, half.y),
  };
}

/**
 * Run a route deeper or shallower by its handle.
 *
 * The route keeps its shape and only its depth changes. Everything past where
 * the man stands slides downfield or back together, so the stem grows or
 * shrinks and the break is the same break a yard or three further on. Depth
 * only: sliding it sideways would lean the stem, and a leaning stem is a
 * different route. Returns the same assignment when nothing moved.
 */
export function slideRoute(a: Assignment, pt: number, y: number): Assignment {
  if (!a.path[pt]) return a;
  const my = y - a.path[pt].y;
  if (!my) return a;
  const path = a.path.map((p, i) =>
    i === 0 ? p : { ...p, y: p.y + my, ...(p.cy !== undefined ? { cy: p.cy + my } : {}) },
  );
  return { ...a, path, edited: true };
}
