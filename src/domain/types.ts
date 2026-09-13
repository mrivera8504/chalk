export type Side = 'offense' | 'defense';

/**
 * Which way a concept runs. Every preset is written to the right and mirrored,
 * and it lives here rather than beside the presets because an assignment
 * remembers the hand it was built with so it can be run the other way later.
 */
export type Hand = 'right' | 'left';

export type ShapeKind = 'circle' | 'square' | 'triangle' | 'x';

/**
 * Positions are stored in yards, never pixels.
 *   x: yards from the middle of the field, positive to the offense's right
 *   y: yards from the line of scrimmage, positive behind the LOS
 */
export interface PlayerSlot {
  id: string;
  label: string;
  side: Side;
  x: number;
  y: number;
  /** Derived from y unless onLineLocked is set. */
  onLine: boolean;
  onLineLocked: boolean;
  /** 1 = QB, 2 = RB. Used for play name suggestions. */
  backNumber?: number;
  /**
   * The shirt of the kid filling this slot, and the link to the roster. A
   * number nobody on the roster wears still draws: the link is a lookup rather
   * than a requirement, so a slot can be filled before the team sheet is.
   */
  jersey?: number;
  shape: ShapeKind;
}

export interface Hole {
  number: number;
  x: number;
}

export type IssueLevel = 'error' | 'warn';

export interface Issue {
  level: IssueLevel;
  text: string;
}

export interface Settings {
  playersPerSide: number;
  minOnLine: number;
  evenHolesSide: 'right' | 'left';
  /** Not used by the play view, which only shows the yards around the LOS. */
  fieldLengthYards: number;
  /** A player within this many yards of the LOS counts as on the line. */
  onLineToleranceYards: number;
}

export const DEFAULT_SETTINGS: Settings = {
  playersPerSide: 7,
  minOnLine: 4,
  evenHolesSide: 'right',
  fieldLengthYards: 70,
  onLineToleranceYards: 1,
};

/** Radius of a player mark, in yards. Blocking geometry starts at the edge. */
export const PLAYER_R = 0.72;

export type AssignmentKind =
  | 'route' // solid, arrowhead
  | 'block' // solid, T-cap on the defender
  | 'combo' // T-cap on a down lineman, then climb to a second defender
  | 'pull' // curved behind the line, T-cap
  | 'carry' // wavy, ball carrier
  | 'motion' // dashed, pre-snap
  | 'option' // dotted
  | 'stay'; // nothing drawn

/** A quadratic control point turns the segment leading into this point into a curve. */
export interface PathPoint {
  x: number;
  y: number;
  cx?: number;
  cy?: number;
  /**
   * Stroke width in yards, set only when a stroke was drawn with pressure
   * turned on. It rides on the point rather than on the assignment so that
   * nothing holding a path had to change shape for it — the annotation layer is
   * a bare array of point arrays, and the eraser splits those in place.
   */
  w?: number;
}

export interface Assignment {
  id: string;
  playerId: string;
  kind: AssignmentKind;
  /** Yards. Regenerated from the players it references whenever either moves. */
  path: PathPoint[];
  targetPlayerId?: string;
  climbToPlayerId?: string;
  preset?: string;
  /**
   * The direction this was generated in. Kept so the run can be flipped:
   * without it, reversing a sweep would have to guess which way it already
   * went from the shape of the path.
   */
  hand?: Hand;
  /** null means derive from the kind. */
  color?: string;
}

/** Kinds the block tool produces: all defined by a blocker and a defender. */
export const BLOCK_KINDS = ['block', 'pull', 'combo'] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

export function isBlockKind(kind: AssignmentKind): kind is BlockKind {
  return (BLOCK_KINDS as readonly string[]).includes(kind);
}

export interface Formation {
  id: string;
  name: string;
  side: Side;
  players: PlayerSlot[];
  builtIn: boolean;
}

export interface Section {
  id: string;
  name: string;
  order: number;
}

export interface Play {
  id: string;
  name: string;
  /** '26 Sweep', computed. Only a suggestion; name always wins if set. */
  suggestedName?: string;
  backNumber?: number;
  hole?: number;
  sectionId: string;
  formationId?: string;
  players: PlayerSlot[];
  assignments: Assignment[];
  /**
   * Who is getting the ball, starred on the board.
   *
   * On the play and not on the player, so it never travels inside a saved
   * formation: how a team lines up and who carries out of it are two different
   * decisions. The namer trusts this over the drawn lines.
   */
  ballCarrierId?: string;
  /** Freehand scratch layer, owned by nobody. */
  annotations: PathPoint[][];
  notes: string;
  coachingPoint: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export const UNFILED_SECTION = 'unfiled';
