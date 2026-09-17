export type Side = 'offense' | 'defense';

/**
 * Which way a concept runs. Every preset is written to the right and mirrored,
 * and it lives here rather than beside the presets because an assignment
 * remembers the hand it was built with so it can be run the other way later.
 */
export type Hand = 'right' | 'left';

export type ShapeKind = 'circle' | 'square' | 'triangle' | 'x' | 'star';

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
  | 'stay' // nothing drawn
  // The defensive half. Kept in the one union rather than given their own,
  // because everything that handles an assignment — the eraser, delete, the
  // color swatches, the selection halo, the exporter — then handles these
  // without being taught anything.
  | 'blitz' // arrow into a gap, the rush color
  | 'contain' // arrow that turns out at the edge and squeezes back
  | 'drop' // arrow to the spot he covers from, dashed
  | 'cover' // defender to the man he has, regenerated from both
  | 'stunt'; // two of them exchanging gaps, regenerated from both

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
  /**
   * Run deeper or shallower by hand after it was given out. The preset still
   * names the concept — a slant three yards deeper is still a slant to the namer
   * — but its path can no longer be regenerated from it, so a flip mirrors the
   * path the coach set instead of redrawing the stock one over it.
   */
  edited?: boolean;
}

/**
 * The quarterback, or nobody.
 *
 * Back number 1 is what every formation marks him with, and it is already what
 * the play namer reads. The vision cone hangs off this rather than off a stored
 * player id, so a formation swapped underneath the play re-anchors the cone on
 * the new quarterback instead of pointing at a man who no longer exists.
 */
export function quarterback(players: PlayerSlot[]): PlayerSlot | null {
  return players.find((p) => p.side === 'offense' && p.backNumber === 1) ?? null;
}

/**
 * What a play is drawn on: dark turf, or the white of a printed sheet.
 *
 * In the domain rather than beside the palette that implements it, because it
 * is a property of a play now and not only a preference — see `Play.surface`.
 */
export type FieldSurface = 'grass' | 'white';

/**
 * The surface this play is actually drawn on.
 *
 * The same shape as `drawnSides` below and for the same reason: four things
 * render a play, and one rule in one place is what stops them disagreeing.
 *
 * `deviceDefault` is the Settings answer, and it speaks for every play that has
 * not been told otherwise — including plays the coach has opened, drawn on and
 * saved. That is the one way this differs from `hideDefense`, which writes
 * itself down on every save. Which men are on the board is a decision about the
 * play, so a play that has been worked on has answered it; what the grass looks
 * like is not. A coach who changes the setting means every play in the book,
 * bar the ones they have deliberately set by hand.
 */
export function playSurface(play: Play, deviceDefault: FieldSurface): FieldSurface {
  return play.surface ?? deviceDefault;
}

/**
 * Which sides of the ball this play draws.
 *
 * One rule, in one place, because four things render a play — the board, the
 * card, the sheet and the exported image — and each used to decide this for
 * itself. They drifted: the printer asked its own question about the front and
 * got its own answer, so a play could come out of the machine showing men the
 * coach had taken off the board.
 *
 * `deviceDefault` is the Settings answer for what a freshly opened play shows,
 * and it only ever speaks for a play that has not been told otherwise.
 */
export function drawnSides(
  play: Play,
  deviceDefault: boolean,
): { offense: boolean; defense: boolean } {
  const defensive = (play.unit ?? 'offense') === 'defense';
  return {
    // The offense is the play on an offensive play, so only a defense can drop it.
    offense: defensive ? !play.hideOffense : true,
    // And the front is the play on a defensive one.
    defense: defensive ? true : (play.hideDefense !== undefined ? !play.hideDefense : deviceDefault),
  };
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

/**
 * Where the quarterback is looking.
 *
 * Only the focus is stored. The apex is the quarterback himself, looked up by
 * back number at render time, for the same reason a block stores who-blocks-whom
 * rather than a line: drag him and the cone follows without anything being
 * regenerated. A play whose formation has no quarterback simply draws no cone.
 */
export interface Vision {
  /** The point he is looking at, in yards. Yards, never pixels, as everywhere. */
  x: number;
  y: number;
}

/**
 * A faint square coming off a man, saying where he is working.
 *
 * The vision cone's twin, and built the same way: one edge anchored on the
 * player, only the far end stored, and that end moved by dragging the wash
 * itself. How far out it goes is also how wide it is — it is a square — so the
 * one offset aims it and sizes it at once.
 */
export interface Focus {
  playerId: string;
  /** The far end, in yards from the man it comes off. */
  dx: number;
  dy: number;
}

/**
 * A patch of grass a defender is responsible for.
 *
 * Deliberately NOT the focus square's shape. A square hangs off the man and
 * grows as it is aimed, which is right for "this receiver works this patch" and
 * wrong for a coverage: a deep third is a wide shallow box sitting where it
 * sits, a flat is beside its man, a hook is behind him. Aiming and sizing have
 * to come apart, so the zone keeps its own center and its own size in yards on
 * the field, and a thin leader line back to the defender says whose it is.
 *
 * Stored on the field and not as an offset for the same reason: dragging the
 * defender must NOT drag his zone. Where he lines up and where he has to get to
 * are two different facts, and the gap between them is what a coach is reading.
 */
export interface Zone {
  playerId: string;
  /** The middle of it, in yards, origin at the middle of the LOS as ever. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The concept it was built from, so the namer can read the coverage back. */
  preset?: string;
  /** 'Flat', 'Deep ⅓'. Drawn in the corner of the wash; blank draws nothing. */
  label?: string;
}

/**
 * Kinds stored as who-does-what-to-whom rather than as geometry, exactly as the
 * block family is: the path is thrown away and rebuilt from both men on every
 * render, so dragging either end redraws the line.
 */
export const LINK_KINDS = ['cover', 'stunt'] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export function isLinkKind(kind: AssignmentKind): kind is LinkKind {
  return (LINK_KINDS as readonly string[]).includes(kind);
}

/** Every kind the defense draws, for the tool row and the picker groups. */
export const DEFENSE_KINDS: AssignmentKind[] = ['blitz', 'contain', 'drop', 'cover', 'stunt'];

export function isDefenseKind(kind: AssignmentKind): boolean {
  return DEFENSE_KINDS.includes(kind);
}

export interface Section {
  id: string;
  name: string;
  order: number;
}

export interface Play {
  id: string;
  name: string;
  /**
   * When this play was thrown away, if it was.
   *
   * Deleting used to drop the play out of the array, which is the one loss the
   * app could cause all by itself with nobody's bug involved — a mis-tap on the
   * wrong card, and the only copy gone. A deleted play stays in the book, sorted
   * to the end of it and filtered out of every list, until the coach empties the
   * trash on purpose. Absent means live, so nothing already saved has to be
   * rewritten to say so.
   */
  deletedAt?: number;
  /**
   * Which unit this play belongs to.
   *
   * Optional, and absent means offense: every play drawn before the defense
   * existed is an offensive play, and a migration that rewrote them all would
   * be touching a hundred saved documents to say what their absence already
   * says. It decides which side the editor opens pointed at, which formations
   * the picker offers, and which rules the namer runs.
   */
  unit?: Side;
  /** '26 Sweep', computed. Only a suggestion; name always wins if set. */
  suggestedName?: string;
  backNumber?: number;
  hole?: number;
  sectionId: string;
  formationId?: string;
  /**
   * The front, kept apart from `formationId` rather than sharing it. A defensive
   * play has an offense on the board too — the look it is set against — so one
   * play can be wearing two formations at once and each has to remember its own.
   */
  defenseFormationId?: string;
  /**
   * The offensive play this defense is drawn against, by id, and nothing more.
   *
   * A reference and never a copy: the look is whatever that play says it is
   * today, so fixing the sweep fixes every defense drawn against it. A play
   * that has since been deleted simply draws no scout look, the same way a
   * formation with no quarterback draws no cone.
   */
  scoutPlayId?: string;
  /**
   * Take the look off the board, on a defensive play drawn against nobody.
   *
   * A flag and not a delete, because the offense is what the front is *for*: the
   * A gap is the space between their center and their guard, so a blitz aimed
   * through it has nothing to aim at once those two men are gone. They stay
   * where they are, keeping the gap map and every cover rope honest, and simply
   * are not drawn — here, and on paper, which is the whole point. A defensive
   * card that hid the look on screen and then printed it would be a card the
   * coach has to check every time.
   *
   * Lives on the play and not on the session, because a sheet printed from the
   * folder list months later has to know it without anybody remembering to set
   * it again. Its twin below says the same thing about the front; read both
   * through `drawnSides`, which is the only place either is interpreted.
   *
   * Absent means shown, so nothing already saved has to be rewritten.
   */
  hideOffense?: boolean;
  /**
   * The same decision about the other side of the ball, on an offensive play.
   *
   * A front only ever gets onto an offensive play because the coach put it
   * there to block against, so whether it is drawn is a fact about the play in
   * exactly the way the look is. It used to be asked again on the way to the
   * printer, which meant the board and the sheet could disagree about a play
   * the coach had already made their mind up about.
   *
   * Absent means "whatever a freshly opened play shows", the device setting —
   * so nothing saved before this existed changes what it prints. Once the
   * coach touches the toggle the play carries its own answer and the setting
   * stops speaking for it. A defensive play ignores this entirely: the front
   * is the play.
   */
  hideDefense?: boolean;
  /**
   * What this one play is drawn on, when it is not drawn on whatever the device
   * is set to.
   *
   * Absent is the normal state and means "follow Settings" — so a coach who
   * switches the book to white switches this play with it. It is written down
   * only when the coach sets this play by hand, and from then on the play holds
   * its own answer on every device it syncs to, which is the point: a card that
   * is white because it gets printed and handed to a quarterback should be
   * white on the tablet it was drawn on and the phone it is opened on.
   *
   * Read through `playSurface`, which is the only place it is interpreted.
   */
  surface?: FieldSurface;
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
  /**
   * The two highlights, both faint and both laid under everything else.
   *
   * On the play beside the star and not on the players: where the quarterback
   * looks and who is worth looking at are decisions about this play, not about
   * how the team lines up, so neither may travel inside a formation. Absent, or
   * empty, means not shown at all.
   */
  vision?: Vision;
  /** The focus squares. Offsets, so each one follows the man it belongs to. */
  focuses?: Focus[];
  /**
   * Coverage zones, beside the other two washes and on the play for the same
   * reason: who has the flat is a call, not part of how the front lines up, so
   * it must never travel inside a saved formation.
   */
  zones?: Zone[];
  /** Freehand scratch layer, owned by nobody. */
  annotations: PathPoint[][];
  notes: string;
  coachingPoint: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export const UNFILED_SECTION = 'unfiled';
