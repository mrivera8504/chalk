import type { BoardMark } from '../../domain/marks';
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import type { Assignment, Focus, PathPoint, PlayerSlot, Vision, Zone } from '../../domain/types';
import type { InkHandle, InkPoint } from '../../render/LiveInkCanvas';
import type { AppSettings } from '../../store/settings';
import type { Pending, Tool } from '../BlockTool';
import type { DragState, Drop, Selection } from '../gesture';

type Ref<T> = MutableRefObject<T>;
type Set<T> = Dispatch<SetStateAction<T>>;

/** A thing lifted by a tap, following the pen until the next tap sets it down. */
export type Carried = {
  kind: DragState['kind'];
  id: string;
  pt?: number;
  dx: number;
  dy: number;
  at: number;
};

/**
 * What the pointer handlers are given: the editor as it stands on this render.
 *
 * Three kinds of thing, and the difference matters. **State** is a snapshot —
 * the board the coach is looking at — and a handler that holds on to it past
 * the event it was called for is holding a stale board. **Refs** are live:
 * everything a gesture has to remember between two pointer events, which
 * arrive faster than a render, is kept in one. **Setters and helpers** are the
 * only way anything here changes the play.
 */
export interface EditorCtx {
  // ---- the board as it is on this render --------------------------------
  tool: Tool;
  /** Sliding the board is switched on. Beats every tool. */
  panning: boolean;
  erasing: boolean;
  pending: Pending | null;
  pan: { x: number; y: number };
  settings: AppSettings;
  /** Equipment and labels, and the one way to change them. */
  marks: BoardMark[];
  setMarks: Dispatch<SetStateAction<BoardMark[]>>;
  /** The board's window: a field's, or a court's. */
  view: { halfWidth: number; downfield: number; behind: number };
  /** The men actually drawn, after the play's own answer on which sides show. */
  visible: PlayerSlot[];
  /** Every line, regenerated from the players. */
  drawn: Assignment[];
  /** The lines actually drawn: `drawn`, less the lines of men who are hidden. */
  shown: Assignment[];
  annotations: PathPoint[][];
  zones: Zone[];
  focuses: Focus[];
  vision: Vision | null;
  qb: PlayerSlot | null;
  /** The grips on the selected man's route. Only ever its end. */
  routeHandles: { id: string; pt: number; x: number; y: number }[];
  byId: (id: string | null | undefined) => PlayerSlot | null;

  // ---- changing the play -------------------------------------------------
  /** Take the snapshot one step of undo goes back to. */
  remember: () => void;
  setPlayers: Set<PlayerSlot[]>;
  setAssignments: Set<Assignment[]>;
  setAnnotations: Set<PathPoint[][]>;
  setZones: Set<Zone[]>;
  setFocuses: Set<Focus[]>;
  setVision: Set<Vision | null>;
  setSel: Set<Selection>;
  setPending: Set<Pending | null>;
  setHoverId: Set<string | null>;
  setCarrying: Set<string | null>;
  setErasing: Set<boolean>;
  setPan: Set<{ x: number; y: number }>;

  // ---- what a gesture remembers between events ---------------------------
  svgRef: RefObject<SVGSVGElement>;
  stageRef: RefObject<HTMLDivElement>;
  /** The thing held under a contact that has not lifted yet. */
  drag: Ref<DragState | null>;
  /** The thing following the pen between the tap that lifted it and the next. */
  carry: Ref<Carried | null>;
  /** The drag that just ended, in case the pen only bounced. */
  lastDrop: Ref<Drop | null>;
  /** Until this time, a contact is the bounce of a tap that finished something. */
  tapGuard: Ref<number>;
  /** This gesture has already taken its one snapshot. */
  gestureRemembered: Ref<boolean>;
  /** Where a pan began, in pixels, and the offset the board had then. */
  panFrom: Ref<{ x: number; y: number; ox: number; oy: number } | null>;
  moveCount: Ref<number>;

  // ---- freehand -----------------------------------------------------------
  ink: RefObject<InkHandle>;
  /** The stroke being drawn, in client pixels, or null between strokes. */
  stroke: Ref<InkPoint[] | null>;
  /** The man a stroke was started on, whose route it becomes. */
  strokeOwner: Ref<string | null>;
  strokeAt: Ref<number>;
  idleTimer: Ref<number | null>;
  commitTimer: Ref<number | null>;
  lastPenAt: Ref<number>;
  lastRawAt: Ref<number>;
  rawBound: Ref<boolean>;

  // ---- the aim ring -------------------------------------------------------
  aimRef: RefObject<SVGGElement>;
  ringRef: RefObject<SVGCircleElement>;
  hoverRef: Ref<string | null>;
  aimQueued: Ref<boolean>;

  /**
   * The handlers of the latest render, for anything that fires later than the
   * event that set it going — a timer, a natively bound listener. Calling a
   * handler captured from an older render acts on an older board.
   */
  live: () => { commitStroke: () => void };
}
