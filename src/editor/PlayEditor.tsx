import { useEffect, useMemo, useRef, useState } from 'react';
import { computeHoles } from '../domain/holes';
import {
  applyOnLine,
  checkFormation,
  countOnLine,
  eligibleReceivers,
} from '../domain/legality';
import { describeAssignment, makeBlock } from '../domain/presets/blocks';
import { refreshPaths } from '../domain/regenerate';
import { computeGaps } from '../domain/gaps';
import { defaultDefense } from '../domain/presets/formations';
import {
  defensePresetById,
  type DefenseContext,
  type DefensePreset,
} from '../domain/presets/defense';
import { freeZone, type ZonePreset } from '../domain/presets/zones';
import { applyCoverage, type CoveragePreset } from '../domain/presets/coverages';
import { makeCover, makeStunt, stuntPartner } from '../domain/presets/links';
import {
  PLAYER_R,
  isBlockKind,
  isLinkKind,
  type Assignment,
  type Formation,
  type PathPoint,
  quarterback,
  type Focus,
  type Play,
  type PlayerSlot,
  type ShapeKind,
  type Side,
  type Vision,
  type Zone,
} from '../domain/types';
import { AssignmentPath } from '../render/AssignmentPath';
import { LiveInkCanvas, type InkHandle, type InkPoint } from '../render/LiveInkCanvas';
import { simplify, snapEnd, straighten, toSmoothPath, widthFromPressure } from '../render/smooth';
import { Field } from '../render/Field';
import { FocusSquare, defaultFocus, insideFocus } from '../render/FocusSquare';
import { ZoneArea, insideZone, onCorner, resizeFrom, zoneCorner } from '../render/Zone';
import { PlayerShape } from '../render/PlayerShape';
import { VisionCone, insideCone } from '../render/VisionCone';
import {
  VIEW,
  clamp,
  nearestAssignment,
  nearestPlayer,
  pickAt,
  pickRadius,
  pxToYards,
  yardsToPx,
  snap,
  snapDepth,
  toYards,
  toPathD,
  type Yards,
} from '../render/geometry';
import {
  mirrorAbout,
  mirrorAnnotations,
  mirrorAssignments,
  mirrorPlayers,
  mirrorZones,
} from '../domain/mirror';
import { SWATCHES, autoRouteColor } from '../domain/colors';
import { byJersey, readRoster, whoIs } from '../domain/roster';
import {
  ROUTES,
  naturalHand,
  otherHand,
  readCustomRoutes,
  toPreset,
  toRelative,
  writeCustomRoutes,
  type CustomRoute,
  type RoutePreset,
} from '../domain/presets/routes';
import {
  foundationDefense,
  foundationOffense,
  readFormations,
  readFoundationId,
  writeFormations,
  writeFoundationId,
} from '../domain/presets/formations';
import { askConfirm, askText } from '../ui/dialog';
import { UndoStack } from '../store/undo';
import { newId } from '../store/usePlaybook';
import {
  BlockTool,
  isPairTool,
  tapBlock,
  tapCover,
  tapStunt,
  type Pending,
  type Tool,
} from './BlockTool';
import { Drawer } from './Drawer';
import { SettingsPanel } from './SettingsPanel';
import { NotesPanel } from './NotesPanel';
import { eraseAt } from '../domain/erase';
import { useSettings, getSettings } from '../store/settings';
import { DefensePanel } from './DefensePanel';
import { FormationPicker } from './FormationPicker';
import { RoutePicker } from './RoutePicker';
import { TracePanel } from './TracePanel';
import { TRACING, describeEvent, trace } from './trace';
import { LegalityBadge } from './LegalityBadge';
import { singlePlayPdf } from '../export/pdf';
import { download, playToPng, playTitle, stamp } from '../export/render';

/*
 * Measured from a real S Pen trace: bounce gaps ran 10-25ms, while a genuine
 * second tap was never under 200ms. The window sits well clear of both.
 */
const CHATTER_MS = 120;
const CHATTER_YARDS = 2.5;

/*
 * A pen wobbles while it is in contact, so without a threshold every tap drags
 * the player a little. In the device trace a 103ms tap moved a guard more than
 * a yard and a half, far enough that the next tap at the same spot found empty
 * grass. Nothing moves until the pen has travelled this far, in screen pixels.
 */
const DRAG_SLOP_PX = 12;

/** Freehand tolerance, in yards. Roughly a tenth of a player's width. */
const INK_TOLERANCE = 0.15;

/**
 * A stroke ends when the pen goes quiet, not when it lifts.
 *
 * This digitizer reports contact for three to five milliseconds at a time
 * unless the pen is pressed hard, so a stroke that needs held pressure cannot
 * be drawn. Hover, by contrast, tracks perfectly: every trace carries hundreds
 * of clean hover samples at zero pressure. So contact is used only to start and
 * finish, and the shape in between is taken from wherever the pen goes.
 */
const INK_IDLE_MS = 700;

/**
 * A stroke has to actually go somewhere. Contact bounce delivers two samples a
 * few milliseconds apart, which is enough to satisfy a bare length check and
 * commit a stub that then displaces a real route.
 */
const INK_MIN_SPAN = 0.8;

/**
 * How close a stroke must begin to a player to be counted as his route, rather
 * than free annotation. Deliberately far tighter than the tap radius: that one
 * is generous so a pen can select at all, but at 2.46 yards everything below
 * the line of scrimmage falls inside somebody's claim, and since a player keeps
 * only one drawn route, every new stroke silently deleted the last.
 */
const INK_OWNER_YARDS = PLAYER_R * 1.6;

/*
 * Whether the drawer is open, remembered across plays and sessions. The editor
 * remounts for every play, and a coach who slid the tools away to see the board
 * wants them to stay away. Defaults to open, so the tools are not hidden behind
 * a tab from someone who has never seen one.
 */
const DRAWER_KEY = 'chalk.drawer.v1';

/**
 * Open on a screen with room for it, shut on one without.
 *
 * Only ever the *first* answer: the coach's own tap on the tab is written down
 * and wins from then on. A phone in portrait gives the panel 58% of the board,
 * so starting there means the first thing anybody sees is a wall of buttons
 * over the play they just opened.
 */
function drawerDefault(): boolean {
  try {
    return window.matchMedia('(orientation: landscape), (min-width: 700px)').matches;
  } catch {
    return true;
  }
}

function readDrawerOpen(): boolean {
  try {
    const saved = localStorage.getItem(DRAWER_KEY);
    if (saved === 'closed') return false;
    if (saved === 'open') return true;
    return drawerDefault();
  } catch {
    return drawerDefault();
  }
}

function writeDrawerOpen(open: boolean): void {
  try {
    localStorage.setItem(DRAWER_KEY, open ? 'open' : 'closed');
  } catch {
    /* storage blocked; the session keeps working */
  }
}

let inkCounter = 0;
const inkId = () => `k${Date.now().toString(36)}${(inkCounter++).toString(36)}`;

/**
 * Offense only; the defense goes on the board when it is asked for. Reset goes
 * back to the foundation rather than to the built-in set, so it means "start
 * this play over" rather than "throw away how this team lines up".
 */
function initialPlayers(unit: Side = 'offense'): PlayerSlot[] {
  const settings = getSettings();
  // A defensive play starts as a front with a look to line up against: gaps are
  // computed from whoever is on the offensive line, so a defence with nobody
  // across from it has no gaps, no blitz aiming points and nothing to cover.
  return unit === 'defense'
    ? applyOnLine([...foundationOffense(), ...foundationDefense()], settings)
    : applyOnLine(foundationOffense(), settings);
}

type Selection = { kind: 'player' | 'assignment'; id: string } | null;

/**
 * A sentinel id for the cone, which has none of its own — there is at most one
 * on a play. Player ids are minted with a prefix, so it can never collide, and
 * `byId` returns null for it without being taught anything. A focus square has
 * no sentinel: it is one per man, so it is carried by its own player's id.
 */
const VISION_ID = '::vision';

/**
 * The same trick for the board itself, which is not a thing on the play at all.
 * Panning goes through `applyDrag` like everything else that moves, so it needs
 * an id to be carried by, and this one belongs to no player either.
 */
const PAN_ID = '::pan';

interface DragState {
  /**
   * What is in hand. `id` is the player for a drag, for a focus square and for
   * a zone — the man each belongs to — and the sentinel for the cone.
   *
   * A zone is the only thing here with two grabs. Its body moves it and its far
   * corner sizes it, which the cone and the square do not need because for them
   * aiming and sizing are the same gesture. A coverage has to be aimed and
   * sized separately: a flat is shallow and wide wherever it is.
   */
  kind: 'player' | 'vision' | 'focus' | 'zone' | 'zone-size' | 'pan';
  id: string;
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
interface Snapshot {
  players: PlayerSlot[];
  assignments: Assignment[];
  annotations: PathPoint[][];
  ballCarrierId: string | null;
  vision: Vision | null;
  focuses: Focus[];
  zones: Zone[];
}

interface EditorProps {
  play: Play;
  /**
   * Every other play in the book, so a defensive play can be set against one.
   * Passed in rather than read from storage here: the playbook owns the list,
   * and the editor already takes the play it is editing from the same place.
   */
  library: Play[];
  onChange: (play: Play) => void;
  onClose: () => void;
  /** Flush to the cloud now, rather than waiting out the autosave debounce. */
  onSave: () => Promise<void>;
}

export function PlayEditor({ play, library, onChange, onClose, onSave }: EditorProps) {
  const settings = useSettings();
  const [players, setPlayers] = useState<PlayerSlot[]>(play.players);
  const [assignments, setAssignments] = useState<Assignment[]>(play.assignments);
  /*
   * Routes, not Move. Opening a play is opening it to say what people run, and
   * the formation underneath is usually the one already wanted — a starred
   * foundation is what every new play is built on. Move is a tap away when a
   * man does need shifting.
   */
  const [tool, setTool] = useState<Tool>('routes');
  const [pending, setPending] = useState<Pending | null>(null);
  const [sel, setSel] = useState<Selection>(null);
  const [showHoles, setShowHoles] = useState(() => getSettings().showHoles);
  /*
   * A defensive play draws the defense whatever the setting says. The toggle is
   * there because most offensive plays are drawn without a front; on this side
   * of the ball, hiding the defense would hide the play.
   */
  const [showDefense, setShowDefense] = useState(
    () => play.unit === 'defense' || getSettings().showDefense,
  );
  /** The gap letters over the line, the defense's half of the hole map. */
  const [showGaps, setShowGaps] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<PathPoint[][]>(play.annotations);
  /** Who is getting the ball. One man at a time; tapping the star again clears it. */
  const [ballCarrierId, setBallCarrierId] = useState<string | null>(
    play.ballCarrierId ?? null,
  );
  /**
   * The two highlights. Null is off — they are not shown until asked for, and
   * turning one off is how it is removed, so there is nothing else to delete.
   */
  const [vision, setVision] = useState<Vision | null>(play.vision ?? null);
  /** The focus squares, one per man at most, each an offset from its player. */
  const [focuses, setFocuses] = useState<Focus[]>(play.focuses ?? []);
  /** The coverage zones. One per defender at most, like the squares. */
  const [zones, setZones] = useState<Zone[]>(play.zones ?? []);
  /**
   * Which unit this play belongs to, decided when it was created and not
   * changeable here: every line already drawn on the board was drawn for one of
   * them, and a switch would leave a defensive play full of pull blocks.
   */
  const unit: Side = play.unit ?? 'offense';
  /** The front, remembered apart from the offense's formation. */
  const [defenseFormationId, setDefenseFormationId] = useState<string | undefined>(
    play.defenseFormationId,
  );
  /** The offensive play this defense is set against, by id. */
  const [scoutPlayId, setScoutPlayId] = useState<string | undefined>(play.scoutPlayId);
  const [name, setName] = useState(play.name);
  const [notes, setNotes] = useState(play.notes);
  const [coachingPoint, setCoachingPoint] = useState(play.coachingPoint);
  const [tags, setTags] = useState<string[]>(play.tags);
  const [erasing, setErasing] = useState(false);
  const [picker, setPicker] = useState<
    'formation' | 'settings' | 'notes' | 'defense' | null
  >(null);
  const [formations, setFormations] = useState<Formation[]>(readFormations);
  /* The starred set for this unit. The two sides star independently. */
  const [foundationId, setFoundationId] = useState<string | null>(() =>
    readFoundationId(play.unit ?? 'offense'),
  );
  const [customRoutes, setCustomRoutes] = useState<CustomRoute[]>(readCustomRoutes);
  /** The team sheet, read once. Edited on the playbook screen, never here. */
  const [roster] = useState(readRoster);
  /*
   * There is no `drawing` flag any more. The hint pill was the only thing that
   * ever read it — `stroke.current` is what the input code itself goes by —
   * so it was a setState on every stroke start and finish, re-rendering the
   * whole board to say something nobody is shown.
   */
  const [carrying, setCarrying] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(readDrawerOpen);
  const [exporting, setExporting] = useState(false);
  /**
   * Board magnification. The viewBox is still in yards, so screen-to-yards goes
   * on working untouched: toYards reads the SVG's own matrix, which already
   * accounts for whatever box is set here.
   */
  const [zoom, setZoom] = useState(1);
  /**
   * Where the window is looking, in yards, as an offset from the default centre.
   *
   * A view control and not a fact about the play: it is never saved, never
   * exported and never undone. Zoom alone was not enough once the route panel
   * took the bottom third — magnifying a board you cannot slide only buys you a
   * bigger view of the part that was already covered.
   */
  const [pan, setPan] = useState({ x: 0, y: 0 });
  /** Whether a tap on the board slides it instead of picking anything up. */
  const [panning, setPanning] = useState(false);
  /**
   * Where a pan began: the pen in client pixels, and the offset at that moment.
   *
   * Pixels, deliberately, where every other drag works in yards. A pan changes
   * the very mapping that yards are measured through, so yards taken from the
   * live matrix are yards in a box that is already moving — the reading chases
   * its own tail. The pen's travel across the glass is the one quantity that
   * does not move underneath it, and the scale is fixed for the whole gesture
   * because zoom cannot change in the middle of one.
   */
  const panFrom = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(0);

  const svgRef = useRef<SVGSVGElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  const moveCount = useRef(0);
  const aimRef = useRef<SVGGElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const hoverRef = useRef<string | null>(null);
  const aimQueued = useRef(false);
  const ink = useRef<InkHandle>(null);
  const stroke = useRef<InkPoint[] | null>(null);
  const strokeOwner = useRef<string | null>(null);
  const commitTimer = useRef<number | null>(null);
  const lastPenAt = useRef(0);
  const rawBound = useRef(false);
  const idleTimer = useRef<number | null>(null);
  /**
   * A player — or a highlight handle — lifted off the board, following the pen
   * until it is tapped down.
   */
  const carry = useRef<
    { kind: DragState['kind']; id: string; dx: number; dy: number; at: number } | null
  >(null);
  const strokeAt = useRef(0);
  const lastRawAt = useRef(0);
  /**
   * Taps are ignored until this moment. Every gesture that finishes something
   * sets it, because the contact bounce that follows the finishing tap would
   * otherwise be read as the start of the next gesture. That mistake appeared
   * three separate times: a bounce ended a stroke it had just begun, a bounce
   * after setting a player down picked one straight back up, and a bounce after
   * finishing a route started a phantom one that ran to wherever the next route
   * began. One guard, set in one place, covers all of them.
   */
  const tapGuard = useRef(0);
  const undo = useRef(new UndoStack<Snapshot>());
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  /**
   * True once this gesture has already taken a snapshot. A drag arrives as
   * dozens of moves, and on this device as several contacts as well, and all of
   * it is one thing the user did: one step back has to undo the whole of it.
   */
  const gestureRemembered = useRef(false);
  /** Where a drag was when contact broke, so a bounce can pick it back up. */
  const lastDrop = useRef<(DragState & { at: number; x: number; y: number }) | null>(null);

  /** The box, scaled and slid. Yards throughout, as ever. */
  const viewBox = useMemo(() => {
    const w = VIEW.halfWidth * 2;
    const h = VIEW.downfield + VIEW.behind;
    // Centre of the default box: the middle of the field, a little downfield.
    const cx = pan.x;
    const cy = (-VIEW.downfield + VIEW.behind) / 2 + pan.y;
    const zw = w / zoom;
    const zh = h / zoom;
    return `${cx - zw / 2} ${cy - zh / 2} ${zw} ${zh}`;
  }, [zoom, pan]);

  /** True when the window is anywhere but where it starts. */
  const viewMoved = zoom !== 1 || pan.x !== 0 || pan.y !== 0;

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  const visible = useMemo(
    () => (showDefense ? players : players.filter((p) => p.side === 'offense')),
    [players, showDefense],
  );

  /**
   * Blocks are stored as who-blocks-whom, so the geometry is rebuilt from the
   * current positions rather than cached. Dragging either man redraws the line.
   */
  const drawn = useMemo(() => refreshPaths(assignments, players), [assignments, players]);

  // settings belongs in both: the rules are live now, and changing which way
  // the even holes run has to renumber the board without touching a player.
  const holes = useMemo(() => computeHoles(players, settings), [players, settings]);
  /*
   * The gap map, the defensive twin of the holes and computed from exactly the
   * same men. Not stored, for the same reason: a blitz aimed at the B gap has
   * to find the B gap that exists now, after the tight end moved.
   */
  const gaps = useMemo(() => computeGaps(players), [players]);
  const issues = useMemo(() => checkFormation(players, settings), [players, settings]);
  /* Derived, never stored: the cone re-anchors itself when the formation does. */
  const qb = useMemo(() => quarterback(players), [players]);
  /** What a defensive concept is a function of, beside the man himself. */
  const defenseCtx: DefenseContext = useMemo(() => ({ gaps, qb }), [gaps, qb]);
  /**
   * The look this defense is drawn against, resolved by id every render.
   *
   * A reference and never a copy: fix the sweep and every defense drawn against
   * it is fixed too. A play that has since been deleted simply draws nothing,
   * the same way a formation with no quarterback draws no cone.
   */
  const scout = useMemo(
    () => (scoutPlayId ? (library.find((p) => p.id === scoutPlayId) ?? null) : null),
    [library, scoutPlayId],
  );
  const onLine = countOnLine(players);
  const defense = useMemo(() => players.filter((p) => p.side === 'defense'), [players]);
  const defenseExists = defense.length > 0;

  const byId = (id: string | null | undefined) => players.find((p) => p.id === id) ?? null;
  const selectedPlayer = sel?.kind === 'player' ? byId(sel.id) : null;
  const selectedBlock = sel?.kind === 'assignment' ? drawn.find((a) => a.id === sel.id) : null;

  /** Backfield players sitting just behind the LOS would cover a hole number. */
  const occupied = useMemo(
    () =>
      players
        .filter((p) => p.side === 'offense' && !p.onLine && p.y > 0 && p.y < 2.6)
        .map((p) => p.x),
    [players],
  );

  /*
   * There is no hint pill any more.
   *
   * It floated at the bottom of the board naming the mode and narrating the
   * gesture — and the bottom of the board is where the quick bar sits and where
   * the inspector now goes for a defensive play, so half of what it said was
   * under something. The tap-move-tap grammar is still shown, but on the board
   * itself: the men in a half-finished block are drawn `pending`, and the aim
   * ring follows the pen.
   */

  function toggleDrawer() {
    const next = !drawerOpen;
    setDrawerOpen(next);
    writeDrawerOpen(next);
    // A picker left open behind a closed drawer reappears unasked next time.
    if (!next) setPicker(null);
  }

  /**
   * Slide the panel away after something has been done with it.
   *
   * The drawer is a menu, not a palette: it covers well over half the board on
   * a phone, and a coach who has just applied a formation wants to see the
   * formation. Deliberately *not* written to storage — only the coach's own tap
   * on the tab changes what the drawer does next time, so a tablet left with the
   * tools out keeps them out.
   */
  function closeDrawerAfter() {
    setPicker(null);
    setDrawerOpen(false);
  }

  /*
   * The inspector takes the edge the drawer is not on, so in landscape the two
   * can be open at once without either covering the other. In portrait it is a
   * strip across the downfield end and the class does nothing.
   */
  const inspectorSide = settings.drawerSide === 'right' ? 'at-left' : 'at-right';

  /**
   * Which end of the board the panel pins itself to, in portrait.
   *
   * It always went downfield, and the comment said why: the backfield is at the
   * bottom, so a panel there covers the backs you just picked up. That was only
   * ever half the board's story — the defense stands downfield, so on a
   * defensive play the very same rule put the panel straight on top of the
   * eleven men whose jobs it had been opened to set.
   *
   * So it takes the far end from whoever is selected rather than a fixed one.
   * Offense is at the LOS and behind it, defense is in front of it, and nothing
   * is drawn at either extreme, so the man in hand always ends up in the clear.
   * In landscape the panel takes a side and this does nothing.
   */
  const inspectorEnd = (side: Side | undefined) =>
    side === 'defense' ? 'at-bottom' : 'at-top';

  /** What the panel's one header says, now that no picker brings its own. */
  const drawerTitle =
    picker === 'settings'
      ? 'Settings'
      : picker === 'notes'
        ? 'Notes'
        : picker === 'formation'
          ? unit === 'defense'
            ? 'Fronts'
            : 'Formations'
          : picker === 'defense'
            ? 'The call'
            : 'Tools';

  const drawerSubtitle = useMemo(() => {
    if (picker === 'settings') return 'Saved on this device, for every play.';
    if (picker === 'formation') {
      const foundation = formations.find((f) => f.id === foundationId);
      return foundation
        ? `New ${unit === 'defense' ? 'defenses' : 'plays'} open in ${foundation.name}.`
        : 'Tap a star to set what new plays open in.';
    }
    if (picker === 'defense' && scout) {
      return `Set against ${scout.name || scout.suggestedName || 'a play'}.`;
    }
    return undefined;
  }, [picker, formations, foundationId, unit, scout]);

  useEffect(() => {
    onChange({
      ...play,
      name,
      players,
      assignments,
      annotations,
      ballCarrierId: ballCarrierId ?? undefined,
      vision: vision ?? undefined,
      focuses: focuses.length ? focuses : undefined,
      zones: zones.length ? zones : undefined,
      unit: play.unit,
      defenseFormationId,
      scoutPlayId,
      notes,
      coachingPoint,
      tags,
    });
    // play and onChange are stable for the life of one editing session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    name,
    players,
    assignments,
    annotations,
    ballCarrierId,
    vision,
    focuses,
    zones,
    defenseFormationId,
    scoutPlayId,
    notes,
    coachingPoint,
    tags,
  ]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el || tool !== 'draw' || !('onpointerrawupdate' in window)) {
      rawBound.current = false;
      return;
    }
    const onRaw = (ev: Event) => {
      lastRawAt.current = performance.now();
      if (stroke.current) extendStroke(ev as PointerEvent);
    };
    el.addEventListener('pointerrawupdate', onRaw);
    rawBound.current = true;
    return () => {
      el.removeEventListener('pointerrawupdate', onRaw);
      rawBound.current = false;
    };
  }, [tool]);

  useEffect(() => {
    const el = stageRef.current;
    if (!TRACING || !el) return;
    const log = (e: Event) => trace(describeEvent(e as PointerEvent));
    const kinds = ['pointercancel', 'lostpointercapture', 'gotpointercapture', 'pointerout'];
    kinds.forEach((k) => el.addEventListener(k, log));
    return () => kinds.forEach((k) => el.removeEventListener(k, log));
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        dropCarried('escape');
        setErasing(false);
        setPending(null);
        setSel(null);
        return;
      }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      // Leave the label field alone.
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (sel?.kind !== 'assignment') return;
      e.preventDefault();
      deleteAssignment(sel.id);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel]);

  function handleTool(next: Tool) {
    dropCarried('tool changed');
    setErasing(false);
    setPending(null);
    setSel(null);
    setTool(next);
    /*
     * Only the two-man tools need a front on the board. This used to fire for
     * anything that was not Select, so picking up the pen to draw a route
     * dropped a whole defense onto the field uninvited.
     */
    const needsFront = isPairTool(next);
    if (needsFront && !defenseExists) {
      setPlayers((prev) => applyOnLine([...prev, ...defaultDefense()], settings));
    }
    if (needsFront) setShowDefense(true);
  }

  function handleDefense() {
    if (!defenseExists) {
      setPlayers((prev) => applyOnLine([...prev, ...defaultDefense()], settings));
      setShowDefense(true);
      return;
    }
    /*
     * Hiding the defense while blocking would leave nothing to tap, so it drops
     * back to Routes — which is where the editor opens. Only the two-man tools
     * need a front: Routes, the pen and the eraser never touch a defender, and
     * kicking them out of the tool they are in would be gratuitous.
     *
     * On a defensive play there is nothing to hide: the defense is the play.
     */
    if (unit === 'defense') return;
    if (showDefense && isPairTool(tool)) setTool('routes');
    setShowDefense((v) => !v);
  }

  /**
   * Tap-tap assignment, for every tool that draws a line between two men.
   *
   * One function for blocks, man coverage and line games, because they are the
   * same gesture: tap who does it, tap who it is done to, and the tool stays
   * armed so the next pair is two taps away. What differs is only which side
   * each tap has to land on, which is the little tap function's business.
   */
  function handlePairTap(player: PlayerSlot) {
    if (!isPairTool(tool)) return;

    const step =
      tool === 'cover'
        ? tapCover(pending, player)
        : tool === 'stunt'
          ? tapStunt(pending, player)
          : tapBlock(tool, pending, player);

    if (step.type === 'none') return;
    if (step.type === 'pending') {
      setPending(step.pending);
      return;
    }

    const first = byId(step.blockerId);
    const target = byId(step.targetId);
    const climbTo = byId(step.climbToId);
    setPending(null);
    setSel(null);
    if (!first || !target) return;

    remember();

    if (tool === 'cover') {
      setAssignments((prev) => [
        // One man per defender. Re-tapping him moves the coverage rather than
        // drawing a second rope off the same player.
        ...prev.filter((a) => !(a.playerId === first.id && a.kind === 'cover')),
        makeCover(first, target),
      ]);
      return;
    }

    if (tool === 'stunt') {
      const pair = makeStunt(first, target);
      setAssignments((prev) => [
        // A stunt is two lines, so both men have to be cleared of any stunt they
        // were already in — otherwise the end loops behind two different people.
        ...prev.filter(
          (a) => !(a.kind === 'stunt' && (a.playerId === first.id || a.playerId === target.id)),
        ),
        ...pair,
      ]);
      return;
    }

    const next = makeBlock(tool, first, target, climbTo ?? undefined);
    setAssignments((prev) => [
      // One block per man. Re-tapping a blocker corrects him instead of stacking.
      ...prev.filter((a) => !(a.playerId === first.id && isBlockKind(a.kind))),
      next,
    ]);
  }

  /**
   * The pen hovers before it touches down, and the trace showed contact landing
   * two to three yards from where it had been hovering. With no feedback there
   * is no way to see that offset, let alone correct for it, so aim is guesswork.
   * Draw the tip, the reach around it, and ring whoever a press would pick up.
   *
   * Written straight to the DOM rather than through state: hover moves arrive
   * far faster than React should re-render. Only the ringed player, which
   * changes rarely, goes through state.
   */
  function showAim(svg: SVGSVGElement, e: React.PointerEvent) {
    // Hover arrives far faster than a frame. Coalesce, or the board re-renders
    // on every sample and the main thread has nothing left for real contacts.
    if (aimQueued.current) return;
    aimQueued.current = true;
    requestAnimationFrame(() => {
      aimQueued.current = false;
    });

    const at = toYards(svg, e.clientX, e.clientY);
    const radius = pickRadius(svg);

    aimRef.current?.setAttribute('transform', `translate(${at.x.toFixed(2)} ${at.y.toFixed(2)})`);
    aimRef.current?.setAttribute('opacity', '1');
    ringRef.current?.setAttribute('r', radius.toFixed(2));

    const id = nearestPlayer(visible, at, radius)?.id ?? null;
    if (id !== hoverRef.current) {
      hoverRef.current = id;
      setHoverId(id);
    }
  }

  function syncUndo() {
    setCanUndo(undo.current.canUndo);
    setCanRedo(undo.current.canRedo);
  }

  /** Call before any edit worth stepping back over. */
  function remember() {
    undo.current.push({
      players,
      assignments,
      annotations,
      ballCarrierId,
      vision,
      focuses,
      zones,
    });
    syncUndo();
  }

  function restore(snap: Snapshot) {
    setPlayers(snap.players);
    setAssignments(snap.assignments);
    setAnnotations(snap.annotations);
    setBallCarrierId(snap.ballCarrierId);
    setVision(snap.vision);
    setFocuses(snap.focuses);
    setZones(snap.zones);
    setSel(null);
    setPending(null);
    syncUndo();
  }

  function stepBack() {
    dropCarried('undo');
    const prev = undo.current.undo({
      players,
      assignments,
      annotations,
      ballCarrierId,
      vision,
      focuses,
      zones,
    });
    if (prev) restore(prev);
    else syncUndo();
  }

  function stepForward() {
    dropCarried('redo');
    const next = undo.current.redo({
      players,
      assignments,
      annotations,
      ballCarrierId,
      vision,
      focuses,
      zones,
    });
    if (next) restore(next);
    else syncUndo();
  }

  /**
   * Apply a concept to the selected player. Presets are functions of where he
   * is standing, so the same slant works from a tight end or a wing without
   * anyone editing a stored shape.
   */
  function applyRoute(preset: RoutePreset) {
    const p = selectedPlayer;
    if (!p) return;
    /*
     * Tapping the concept he is already running takes it back off.
     *
     * A route list is a row of on/off buttons and not a one-way door: a man is
     * given a slant by tapping Slant, so the undoing of that is tapping Slant.
     * Picking a different one still overrides, because that is the same rule —
     * the last thing said about him wins.
     *
     * Ahead of remember(), because clearRoute takes its own snapshot and two of
     * them would be two identical steps back for one tap.
     */
    if (routeOf(p.id)?.preset === preset.id) {
      clearRoute(p.id);
      return;
    }
    remember();
    const hand = preset.hand ?? naturalHand(p);
    setAssignments((prev) => [
      ...prev.filter((a) => !(a.playerId === p.id && !isBlockKind(a.kind))),
      {
        id: newId('a'),
        playerId: p.id,
        kind: preset.carry ? 'carry' : 'route',
        path: preset.shape(p, hand),
        preset: preset.id,
        hand,
      },
    ]);
  }

  /**
   * Apply a defensive concept to the selected man.
   *
   * The twin of applyRoute, and separate from it rather than folded in, because
   * a defensive concept is a function of one more thing than a route is: the gap
   * map. A blitz is aimed at the space between two offensive players, so it has
   * to be handed the map the same way the namer is handed the holes.
   */
  function applyDefensePreset(preset: DefensePreset) {
    const p = selectedPlayer;
    if (!p) return;
    // Same on/off rule the route list follows: the job he is already doing
    // comes off when it is tapped again, and any other job overrides it.
    const current = jobOf(p.id);
    if (current?.preset === preset.id) {
      remember();
      setAssignments((prev) => prev.filter((a) => a.id !== current.id));
      return;
    }
    remember();
    const hand = preset.hand ?? naturalHand(p);
    setAssignments((prev) => [
      // One job per defender, the way a man has one route. His coverage of a
      // receiver is a different fact and survives: a linebacker can blitz and
      // still have somebody if he does not get there.
      ...prev.filter((a) => !(a.playerId === p.id && !isBlockKind(a.kind) && !isLinkKind(a.kind))),
      {
        id: newId('a'),
        playerId: p.id,
        kind: preset.kind,
        path: preset.shape(p, hand, defenseCtx),
        preset: preset.id,
        hand,
      },
    ]);
    /*
     * A man coming is not a man covering grass. Sending a blitzer who still
     * wears a deep third would draw a call nobody plays, so the last thing said
     * about him wins — the same rule that gives him one route or one job.
     * A drop is left alone: dropping to the box he owns is the box, drawn.
     */
    if (preset.group === 'rush') setZones((prev) => prev.filter((z) => z.playerId !== p.id));
  }

  /**
   * Give this man a zone, or take it off him. One each, like a focus square.
   *
   * A zone switched on with no concept behind it lands out in front of him at a
   * useful size, for the reason the cone starts eight yards downfield: an empty
   * box under his own mark reads as the feature having failed rather than as
   * something waiting to be dragged.
   */
  function toggleZone(player: PlayerSlot) {
    remember();
    setZones((prev) =>
      prev.some((z) => z.playerId === player.id)
        ? prev.filter((z) => z.playerId !== player.id)
        : [...prev, { playerId: player.id, ...freeZone(player) }],
    );
  }

  function applyZonePreset(preset: ZonePreset) {
    const p = selectedPlayer;
    if (!p) return;
    remember();
    // The grass he already owns comes off when its own button is tapped again.
    // A different zone still replaces it: a man has one patch, like one route.
    if (zones.find((z) => z.playerId === p.id)?.preset === preset.id) {
      setZones((prev) => prev.filter((z) => z.playerId !== p.id));
      return;
    }
    const shape = preset.shape(p, naturalHand(p), VIEW);
    setZones((prev) => [...prev.filter((z) => z.playerId !== p.id), { playerId: p.id, ...shape }]);
    // The other half of the same rule: a man given grass to cover is not also
    // being sent, so the rush he was wearing comes off.
    setAssignments((prev) =>
      prev.filter(
        (a) => !(a.playerId === p.id && (a.kind === 'blitz' || a.kind === 'contain')),
      ),
    );
  }

  /**
   * Put a whole coverage on the board.
   *
   * The one call that is genuinely about seven men at once — who has the deep
   * third only means anything once you know who else is deep — so it is applied
   * as a call rather than as seven trips to the picker. Everything it draws is
   * an ordinary zone and an ordinary cover line afterwards: drag a box, delete a
   * rope, and the coverage is whatever is on the board, which is also what the
   * namer reads back.
   */
  function applyCoveragePreset(coverage: CoveragePreset) {
    remember();
    const result = applyCoverage(coverage, players, VIEW);

    setZones(result.zones);
    setAssignments((prev) => [
      // Last call wins. A second coverage laid over the first would leave the
      // previous one's ropes hanging off men who are now playing zone.
      ...prev.filter((a) => a.kind !== 'cover'),
      ...result.man.flatMap((m) => {
        const d = byId(m.defenderId);
        const r = byId(m.receiverId);
        return d && r ? [makeCover(d, r)] : [];
      }),
    ]);
    setSel(null);
    closeDrawerAfter();
  }

  /**
   * The nearest man he could be covering, for the one-tap Man button.
   *
   * Eligible receivers only, computed from the board: covering the centre is
   * not a thing anybody does, and offering it would make the one-tap version of
   * this tool wrong more often than right.
   */
  function nearestReceiver(defender: PlayerSlot): PlayerSlot | null {
    const eligible = eligibleReceivers(players);
    if (!eligible.length) return null;
    return eligible.reduce((best, p) =>
      Math.hypot(p.x - defender.x, p.y - defender.y) <
      Math.hypot(best.x - defender.x, best.y - defender.y)
        ? p
        : best,
    );
  }

  function coverNearest(defender: PlayerSlot) {
    // Man up is a toggle too, and it has to be: the rope it draws is the one
    // thing in the picker with no button of its own to take it off again.
    if (assignments.some((a) => a.playerId === defender.id && a.kind === 'cover')) {
      remember();
      setAssignments((prev) =>
        prev.filter((a) => !(a.playerId === defender.id && a.kind === 'cover')),
      );
      return;
    }
    const man = nearestReceiver(defender);
    if (!man) return;
    remember();
    setAssignments((prev) => [
      ...prev.filter((a) => !(a.playerId === defender.id && a.kind === 'cover')),
      makeCover(defender, man),
    ]);
  }

  /**
   * Set this defense against an offensive play.
   *
   * The look is copied in rather than drawn from a live reference, and that is
   * the whole decision. A reference would leave the gap map, every cover line
   * and every pick on the board naming players that live in another document —
   * and the gap map is computed from whoever is on the line *here*. So the
   * offense is replaced by a copy the coach can then nudge, and the id is kept
   * only to say on the sheet which play it was set against.
   */
  function applyScout(source: Play) {
    remember();
    const look = structuredClone(source.players.filter((p) => p.side === 'offense'));
    const theirIds = new Set(look.map((p) => p.id));
    const theirLines = structuredClone(
      source.assignments.filter((a) => theirIds.has(a.playerId)),
    );

    const next = applyOnLine([...look, ...players.filter((p) => p.side === 'defense')], settings);
    const gone = new Set(players.filter((p) => p.side === 'offense').map((p) => p.id));
    setPlayers(next);
    /*
     * Everything the defense had drawn survives the look changing, except what
     * was about one of the men who just left: a rope to their tight end means
     * nothing once a different team is lined up across the ball.
     *
     * Dropped explicitly rather than left to refreshPaths, which would keep a
     * rope whose target id happens to exist in the new look — player ids are
     * only unique within a play, so an id that came back would silently point
     * the coverage at whoever inherited it.
     */
    setAssignments((prev) =>
      refreshPaths(
        [...prev.filter((a) => !a.targetPlayerId || !gone.has(a.targetPlayerId)), ...theirLines],
        next,
      ),
    );
    setZones((prev) => prev.filter((z) => next.some((p) => p.id === z.playerId)));
    setFocuses((prev) => prev.filter((f) => next.some((p) => p.id === f.playerId)));
    setScoutPlayId(source.id);
    setBallCarrierId(source.ballCarrierId ?? null);
    setSel(null);
    closeDrawerAfter();
  }

  /**
   * Every concept the picker can apply, the user's own included, by id.
   *
   * Flipping has to find the preset a line came from, and a saved route is a
   * preset in every sense that matters here — it is a shape that is a function
   * of where the man is standing, so it regenerates the other way for free.
   */
  const presetsById = useMemo(() => {
    const all = new Map<string, RoutePreset>();
    for (const r of ROUTES) all.set(r.id, r);
    for (const r of customRoutes) all.set(r.id, toPreset(r));
    return all;
  }, [customRoutes]);

  /**
   * Run the same concept the other way.
   *
   * Presets are regenerated rather than mirrored, so a sweep flipped to the
   * left is the sweep a left-handed pick would have drawn, curve and all,
   * instead of a reflected copy of a right-handed one. The two wide runs aim at
   * an absolute sideline and cannot be turned round that way, so they swap for
   * their twin: the play has to keep saying which way it actually goes.
   *
   * A hand-drawn line has no concept behind it, so that one is genuinely
   * mirrored — about its own first point, which leaves the start where the pen
   * put it and sends the rest the other way.
   */
  function flipRoute(player: PlayerSlot) {
    const current = routeOf(player.id);
    if (!current) return;
    remember();

    const was = current.hand ?? naturalHand(player);

    /*
     * A defensive concept flips exactly as an offensive one does: regenerated
     * with the other hand rather than reflected, so a contain rush turned round
     * is the contain a left-handed pick would have drawn. It is looked up in its
     * own table because its shape needs the gap map as well as the man.
     */
    const def = current.preset ? defensePresetById(current.preset) : null;
    if (def) {
      const hand = otherHand(was);
      setAssignments((prev) =>
        prev.map((a) =>
          a.id === current.id
            ? { ...a, hand, path: def.shape(player, hand, defenseCtx) }
            : a,
        ),
      );
      return;
    }

    const preset = current.preset ? presetsById.get(current.preset) : undefined;
    const twin = preset?.flipId ? presetsById.get(preset.flipId) : undefined;
    const next = twin ?? preset;

    setAssignments((prev) =>
      prev.map((a) => {
        if (a.id !== current.id) return a;
        if (next) {
          const hand = twin ? (twin.hand ?? otherHand(was)) : otherHand(was);
          return {
            ...a,
            preset: next.id,
            kind: next.carry ? 'carry' : 'route',
            hand,
            path: next.shape(player, hand),
          };
        }
        return { ...a, hand: otherHand(was), path: mirrorAbout(a.path, a.path[0]?.x ?? player.x) };
      }),
    );
  }

  /** Star the man getting the ball, or take the star off him. */
  function giveBall(id: string) {
    remember();
    setBallCarrierId((prev) => (prev === id ? null : id));
  }

  /** The route this player is actually running, if he has one drawn. */
  function routeOf(playerId: string) {
    return assignments.find((a) => a.playerId === playerId && !isBlockKind(a.kind)) ?? null;
  }

  /**
   * The one job a defender is doing — his rush or his drop, and not the man he
   * has. The twin of routeOf, and separate from it because a defender's rope to
   * a receiver is a different fact that survives him being sent: the picker's
   * on/off state has to be about the button that was tapped, so it has to look
   * at exactly the assignment that button writes.
   */
  function jobOf(playerId: string) {
    return (
      assignments.find(
        (a) => a.playerId === playerId && !isBlockKind(a.kind) && !isLinkKind(a.kind),
      ) ?? null
    );
  }

  /**
   * Keep a drawn route as a concept.
   *
   * Stored relative to the man who ran it, so it can be given to anybody
   * afterwards — the same rule every built-in preset follows.
   */
  async function saveDrawnRoute(player: PlayerSlot) {
    const current = routeOf(player.id);
    if (!current || current.path.length < 2) return;
    const label = await askText('Name this route', {
      body: 'It keeps the shape, not the spot, so you can give it to anyone.',
      placeholder: 'Skinny post',
      label: 'Route name',
    });
    if (!label?.trim()) return;

    const route: CustomRoute = {
      id: newId('r'),
      name: label.trim(),
      group: current.kind === 'carry' ? 'run' : 'pass',
      carry: current.kind === 'carry',
      points: toRelative(current.path),
    };
    const all = [...customRoutes, route];
    setCustomRoutes(all);
    writeCustomRoutes(all);
  }

  function deleteCustomRoute(id: string) {
    const all = customRoutes.filter((r) => r.id !== id);
    setCustomRoutes(all);
    writeCustomRoutes(all);
  }

  function clearRoute(playerId: string) {
    remember();
    setAssignments((prev) => prev.filter((a) => !(a.playerId === playerId && !isBlockKind(a.kind))));
  }

  /** Flip the whole play. Hole numbers follow because they are recomputed. */
  function mirror() {
    remember();
    setPlayers((prev) => mirrorPlayers(prev));
    setAssignments((prev) => mirrorAssignments(prev));
    setAnnotations((prev) => mirrorAnnotations(prev));
    /*
     * A zone is a piece of the field, so it mirrors with the field: the deep
     * third on the left is the one on the right when the play turns round, and
     * the man it belongs to has gone with it.
     */
    setZones((prev) => mirrorZones(prev));
    // Only the cone's focus is a field position, so only it flips. Its apex
    // moves with the quarterback, and a focus square is an id: its man is
    // already on the other side, and the square is wherever he is.
    setVision((prev) => (prev ? { ...prev, x: -prev.x } : prev));
    setSel(null);
    closeDrawerAfter();
  }

  /**
   * Swap in a formation, on whichever side of the ball it belongs to.
   *
   * It replaces its own side and leaves the other one standing, so a coach can
   * try the same front against three different looks — or three fronts against
   * one — without redrawing the half of the board he is not thinking about.
   */
  function applyFormation(f: Formation) {
    remember();
    const next = [
      ...applyOnLine(structuredClone(f.players), settings),
      ...players.filter((p) => p.side !== f.side),
    ];
    setPlayers(next);
    // Assignments, the star, the squares and the zones all name players that no
    // longer exist. The cone is the exception: it is anchored by back number,
    // so it re-finds the new formation's quarterback on its own.
    setAssignments((prev) => refreshPaths(prev, next));
    setZones((prev) => prev.filter((z) => next.some((p) => p.id === z.playerId)));
    setFocuses((prev) => prev.filter((fc) => next.some((p) => p.id === fc.playerId)));
    if (!next.some((p) => p.id === ballCarrierId)) setBallCarrierId(null);
    if (f.side === 'defense') setDefenseFormationId(f.id);
    setSel(null);
    closeDrawerAfter();
  }

  /** Saves the unit this play is about: a defensive play saves its front. */
  async function saveFormation() {
    const label = await askText(unit === 'defense' ? 'Name this front' : 'Name this formation', {
      body:
        unit === 'defense'
          ? 'Saves where these seven are standing, to drop onto any play.'
          : 'Saves where these seven are standing, to drop onto any play.',
      placeholder: unit === 'defense' ? '5-2 Tight' : 'Trips right',
      label: 'Name',
    });
    if (!label?.trim()) return;
    const next: Formation = {
      id: newId('f'),
      name: label.trim(),
      side: unit,
      players: structuredClone(players.filter((p) => p.side === unit)),
      builtIn: false,
    };
    const all = [...formations, next];
    setFormations(all);
    writeFormations(all);
  }

  function deleteFormation(id: string) {
    const all = formations.filter((f) => f.id !== id);
    setFormations(all);
    writeFormations(all);
    // A foundation pointing at a formation that no longer exists would silently
    // fall back to the built-in set, which reads as the star being ignored.
    if (id === foundationId) setFoundation(null);
  }

  function setFoundation(id: string | null) {
    setFoundationId(id);
    writeFoundationId(id, unit);
  }

  function dropCarried(reason: string) {
    const held = carry.current;
    carry.current = null;
    tapGuard.current = performance.now() + CHATTER_MS;
    setCarrying(null);
    if (TRACING && held) trace(`            -> placed ${byId(held.id)?.label} (${reason})`);
  }

  function moveCarried(svg: SVGSVGElement, at: Yards, client?: { x: number; y: number }) {
    const c = carry.current;
    if (!c) return;
    applyDrag(
      svg,
      { kind: c.kind, id: c.id, dx: c.dx, dy: c.dy, ox: 0, oy: 0, moved: true },
      at,
      client,
    );
  }

  function clearAim() {
    aimRef.current?.setAttribute('opacity', '0');
    if (hoverRef.current !== null) {
      hoverRef.current = null;
      setHoverId(null);
    }
  }

  /**
   * Move the player under a drag to a pointer position.
   *
   * Called from pointermove, and also from pointerdown when a bounce resumes.
   * The pen's contacts run 2-5ms, far too short for a move event to fire inside
   * one, and it travels while it is off the glass. So for this device the down
   * events carry nearly all the position information there is. Using them only
   * to choose a player, then waiting for a move that never arrives, is why a
   * drag picked the right man and then left him standing where he was.
   */
  function applyDrag(
    svg: SVGSVGElement,
    d: DragState,
    at: Yards,
    /** The same point in client pixels. Only the pan needs it; see below. */
    client?: { x: number; y: number },
  ): boolean {
    if (!d.moved) {
      if (Math.hypot(at.x - d.ox, at.y - d.oy) < pxToYards(svg, DRAG_SLOP_PX)) return false;
      d.moved = true;
    }

    /*
     * Sliding the window, and it comes first because it is the one drag that
     * changes nothing on the play.
     *
     * No snapshot: the view is not part of a play, so a step back over a pan
     * would be a step that undid nothing anyone could see. No grid and no
     * magnet either — those tidy a man onto a yard line, and this is not a man.
     *
     * Worked in pixels rather than in yards. Every other drag reads its target
     * off the live matrix, but a pan *is* a change to that matrix, so yards
     * taken from it are yards in a box that has already moved: the reading
     * chases its own tail and the board drifts. Pen travel across the glass is
     * the one quantity that stays still underneath the gesture, and the scale
     * is fixed for its whole length because zoom cannot change mid-drag. The
     * offset is set absolutely from where the grab began, never accumulated, so
     * a frame that renders late cannot leave the board a yard adrift.
     */
    if (d.kind === 'pan') {
      const from = panFrom.current;
      const ctm = svg.getScreenCTM();
      if (!from || !ctm || !client) return true;
      const half = { x: VIEW.halfWidth, y: (VIEW.downfield + VIEW.behind) / 2 };
      setPan({
        // Drag right and the field goes right, which means the window goes
        // left. Clamped so the middle of the view stays over the field: a board
        // you can slide off the screen entirely is a board you can lose.
        x: clamp(from.ox - (client.x - from.x) / ctm.a, -half.x, half.x),
        y: clamp(from.oy - (client.y - from.y) / ctm.d, -half.y, half.y),
      });
      return true;
    }

    // The first movement of a gesture is the moment there is something to step
    // back over, and the snapshot taken here is still the pre-drag board.
    if (!gestureRemembered.current) {
      gestureRemembered.current = true;
      remember();
    }

    /*
     * Only the offense is magnetised to the line. A defender belongs head-up on
     * the ball often enough, and snapping him flush would sit him exactly on top
     * of the lineman he is over, which draws as one mark rather than two.
     *
     * Neither highlight is magnetised at all: the line of scrimmage means
     * nothing to where a quarterback is looking, nor to the patch of grass a
     * receiver is working into.
     */
    const onOffense = d.kind === 'player' && byId(d.id)?.side === 'offense';
    const step = settings.snapStepYards;
    const magnet = onOffense ? settings.losMagnetYards : 0;

    /*
     * A man is kept a yard inside the board so his mark and his number stay on
     * it. A zone's corner is not a man: a deep third is a third of the field,
     * and stopping its corner a yard short of the sideline meant the widest
     * zone the coverage tool draws could not be redrawn at the width it was
     * given. The corner may go to the edge; the middle of a box still may not,
     * or the box would slide off the board entirely.
     */
    const edge = d.kind === 'zone-size' ? 0 : 1;
    const x = clamp(snap(at.x + d.dx, step), -VIEW.halfWidth + edge, VIEW.halfWidth - edge);
    const y = clamp(
      snapDepth(at.y + d.dy, d.kind === 'player' ? magnet : 0, step),
      -VIEW.downfield + edge,
      VIEW.behind - edge,
    );

    if (d.kind === 'vision') {
      setVision({ x, y });
      return true;
    }
    if (d.kind === 'zone' || d.kind === 'zone-size') {
      setZones((prev) =>
        prev.map((z) => {
          if (z.playerId !== d.id) return z;
          // Moving keeps the box the size it is and puts its middle under the
          // pen; sizing pins the near corner and grows it out of that corner.
          return d.kind === 'zone' ? { ...z, x, y } : resizeFrom(z, { x, y });
        }),
      );
      return true;
    }
    if (d.kind === 'focus') {
      // The far end, stored as an offset from the man so it stays with him.
      // Dragging it out both aims the square and opens it up, since how far it
      // reaches is also how wide it is.
      const man = byId(d.id);
      if (man) {
        setFocuses((prev) =>
          prev.map((f) => (f.playerId === d.id ? { ...f, dx: x - man.x, dy: y - man.y } : f)),
        );
      }
      return true;
    }

    setPlayers((prev) =>
      applyOnLine(
        prev.map((p) => (p.id === d.id ? { ...p, x, y } : p)),
        settings,
      ),
    );
    return true;
  }

  function handleMove(e: React.PointerEvent) {
    const d = drag.current;
    const svg = svgRef.current;
    if (!svg) return;

    /*
     * A move across a floating panel is not a move across the board.
     *
     * pointerdown has always been guarded, but this was not, so a carried
     * player followed the pen onto the inspector and was dropped wherever the
     * finger happened to land on it. Reaching for the route list flung him
     * downfield. A genuine drag is unaffected: it holds pointer capture on the
     * stage, so its events retarget there and never match this.
     */
    if (!d && (e.target as Element).closest?.('.inspector, .drawer, .quick-bar')) {
      clearAim();
      return;
    }
    if (tool === 'erase') {
      const at = toYards(svg, e.clientX, e.clientY);
      // Hovering counts. This pen is off the glass most of the time, and an
      // eraser that needed contact would be an eraser that never moved.
      if (erasing) eraseUnder(at, svg);
      else if (e.pointerType !== 'touch') showAim(svg, e);
      return;
    }

    if (tool === 'draw') {
      /*
       * Raw updates carry one sample per event and are bound natively below, so
       * plain moves are ignored while they are arriving; handling both would
       * double every point. But the browser advertising pointerrawupdate is not
       * a promise that it fires for a hovering pen, and hover is how a stroke
       * gets its shape here. If none has arrived recently, take the move.
       */
      const rawFlowing = rawBound.current && performance.now() - lastRawAt.current < 100;
      if (stroke.current && !rawFlowing) extendStroke(e);
      else if (!stroke.current && e.pointerType !== 'touch') showAim(svg, e);
      return;
    }

    if (!d) {
      if (carry.current) {
        moveCarried(svg, toYards(svg, e.clientX, e.clientY), { x: e.clientX, y: e.clientY });
        return;
      }
      /*
       * Touch has no hover, so there is nothing to preview for a finger — and
       * the ring says what a press would pick up, which while the board tool is
       * out is nothing at all.
       */
      if (e.pointerType !== 'touch' && !panning) showAim(svg, e);
      // A move with no drag underway is either hover or a lost grip. Both are
      // worth seeing, but only occasionally, or the log is nothing else.
      if (TRACING && e.pointerType === 'pen' && moveCount.current++ % 25 === 0) {
        trace(`${describeEvent(e)}  [no drag underway]`);
      }
      return;
    }

    applyDrag(svg, d, toYards(svg, e.clientX, e.clientY), { x: e.clientX, y: e.clientY });
    e.preventDefault();
  }

  function handleUp(e: React.PointerEvent) {
    if (TRACING) trace(`${describeEvent(e)}  drag=${drag.current ? 'yes' : 'NONE'}`);

    // A lift means nothing while drawing: this pen lifts constantly. The idle
    // timer, or a second tap, is what ends a stroke.
    if (tool === 'draw' || tool === 'erase') return;
    if (!drag.current) return;

    // Provisional, not final: the pen may simply have bounced. handleStageDown
    // decides, by how soon and how near the next contact lands.
    const svg = svgRef.current;
    const at = svg ? toYards(svg, e.clientX, e.clientY) : null;
    lastDrop.current = at
      ? { ...drag.current, at: performance.now(), x: at.x, y: at.y }
      : null;

    /*
     * Contact that ended without travelling was a tap, so lift the player and
     * let him follow the pen. Holding contact and dragging still works and ends
     * here as it always did, which is what a finger does; this path is for a
     * pen that cannot hold contact at all.
     */
    if (!drag.current.moved && (tool === 'select' || drag.current.kind !== 'player')) {
      carry.current = { ...drag.current, at: performance.now() };
      setCarrying(drag.current.id);
      if (TRACING) trace(`            -> carrying ${byId(drag.current.id)?.label}`);
    }
    drag.current = null;
    try {
      stageRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }

  /**
   * The stage owns hit testing rather than each player shape. Chrome applies
   * touch adjustment to a finger but hit-tests a stylus at the exact pixel, so
   * a mark a finger grabs first time needs the pen placed dead on it. Missing
   * used to land on the background and clear the selection, which is why a drag
   * appeared to deselect itself halfway.
   */
  /**
   * Palm rejection: ignore touch that lands while the pen is in play.
   *
   * Pen-only is the stronger version of the same rule, for a hand that rests on
   * the glass for longer than the 800ms window. It gates the ink tools alone —
   * `accepts` is not on the path that drags a player, and a finger has to go on
   * moving marks around whatever this is set to.
   */
  function accepts(e: React.PointerEvent | PointerEvent): boolean {
    if (e.pointerType === 'pen') {
      lastPenAt.current = performance.now();
      return true;
    }
    if (e.pointerType === 'touch') {
      if (getSettings().penOnly) return false;
      return performance.now() - lastPenAt.current > 800;
    }
    return true;
  }

  function extendStroke(e: React.PointerEvent | PointerEvent) {
    const pts = stroke.current;
    if (!pts || !accepts(e)) return;

    // One event per sample with raw updates; with plain moves the samples are
    // batched, so unpack them or the stroke corners off at speed.
    const native = 'getCoalescedEvents' in e ? (e as PointerEvent) : null;
    const batch = native?.getCoalescedEvents?.() ?? null;
    if (batch && batch.length > 1) {
      for (const c of batch) pts.push({ x: c.clientX, y: c.clientY, p: c.pressure });
    } else {
      pts.push({ x: e.clientX, y: e.clientY, p: e.pressure });
    }

    const ahead = (e as PointerEvent).getPredictedEvents?.() ?? [];
    // Preview at the width it will commit at, or the jump on release reads as
    // the app having changed its mind about the stroke.
    const svg = svgRef.current;
    const yards = getSettings().pressureWidth
      ? widthFromPressure(pts.map((q) => q.p ?? 0))
      : undefined;
    ink.current?.draw(
      pts,
      ahead.map((q) => ({ x: q.clientX, y: q.clientY })),
      yards && svg ? yardsToPx(svg, yards) : undefined,
    );

    // Any movement, hovering or not, keeps the stroke alive.
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(commitStroke, INK_IDLE_MS);
  }

  /**
   * Turn the raw samples into an assignment.
   *
   * Simplified first, because a pen lays down hundreds of points that describe
   * a straight line. Then, if the coach asked for it, squared up — near-flat
   * segments go flat and the last point settles onto a yard — and only then
   * smoothed, so the corners that survive read as the curve the hand drew.
   * Squaring has to happen before smoothing or it would be straightening the
   * midpoints the smoother invented rather than the corners the hand turned at.
   */
  function commitStroke() {
    const pts = stroke.current;
    const owner = strokeOwner.current;
    stroke.current = null;
    strokeOwner.current = null;
    commitTimer.current = null;
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    idleTimer.current = null;
    tapGuard.current = performance.now() + CHATTER_MS;
    ink.current?.clear();

    const svg = svgRef.current;
    if (!pts || pts.length < 2 || !svg) return;

    const yards = pts.map((q) => toYards(svg, q.x, q.y));

    // Furthest any sample strayed from the start. A stray contact never leaves.
    const span = yards.reduce(
      (far, q) => Math.max(far, Math.hypot(q.x - yards[0].x, q.y - yards[0].y)),
      0,
    );
    if (span < INK_MIN_SPAN) {
      if (TRACING) trace(`stroke discarded: ${pts.length} samples spanning ${span.toFixed(2)}yd`);
      return;
    }

    let shaped = simplify(yards, INK_TOLERANCE);
    if (settings.squareUpStrokes) shaped = snapEnd(straighten(shaped));

    const path = toSmoothPath(shaped);
    if (path.length < 2) return;

    // One width for the whole stroke, written onto every point so that an
    // erased fragment keeps the weight of the stroke it was cut from.
    const width = settings.pressureWidth
      ? widthFromPressure(pts.map((q) => q.p ?? 0))
      : undefined;
    const inked = width === undefined ? path : path.map((q) => ({ ...q, w: width }));

    if (TRACING) trace(`stroke committed: ${pts.length} samples -> ${path.length} points`);

    remember();
    if (owner) {
      // One drawn route per player; drawing again replaces it.
      setAssignments((prev) => [
        ...prev.filter((a) => !(a.playerId === owner && a.kind === 'route')),
        { id: inkId(), playerId: owner, kind: 'route', path: inked },
      ]);
    } else {
      setAnnotations((prev) => [...prev, inked]);
    }
  }

  function handleStageDown(e: React.PointerEvent) {
    const svg = svgRef.current;
    if (!svg) return;
    // The inspector and the drawer float inside the stage; taps on either are
    // not board taps. Returning before preventDefault is what lets their
    // buttons behave like buttons. The drawer's own wrapper is inert, so this
    // only ever catches the panel and its tab.
    if ((e.target as Element).closest?.('.inspector, .drawer, .quick-bar')) return;
    e.preventDefault();

    const at = toYards(svg, e.clientX, e.clientY);
    clearAim();

    // Nothing that just finished gets to be restarted by its own bounce.
    if (performance.now() < tapGuard.current && !carry.current) {
      if (TRACING) trace(`${describeEvent(e, at)}\n            -> bounce after a finished gesture, ignored`);
      return;
    }

    /*
     * Sliding the board beats every tool, because it is not one.
     *
     * Ahead of the pencil and the eraser deliberately: the toggle is a statement
     * about what the next tap does, and a coach who has said "move the board"
     * and then drawn a line across it would have caught the app lying. Nothing
     * here picks anything up, so no mode's own rule is broken by it.
     *
     * Tap, move the pen, tap — the same grammar as everything else, and it
     * comes free: the lift with no travel hands the board to `carry`, hover
     * moves slide it, and the next tap sets it down. A finger that holds
     * contact drags it directly, as a finger always has.
     */
    if (panning) {
      if (carry.current) {
        if (performance.now() - carry.current.at > CHATTER_MS) dropCarried('board set down');
        return;
      }
      panFrom.current = { x: e.clientX, y: e.clientY, ox: pan.x, oy: pan.y };
      drag.current = { kind: 'pan', id: PAN_ID, dx: 0, dy: 0, ox: at.x, oy: at.y, moved: false };
      gestureRemembered.current = false;
      try {
        stageRef.current?.setPointerCapture(e.pointerId);
      } catch {
        /* not fatal */
      }
      if (TRACING) trace(`${describeEvent(e, at)}\n            -> grabbed the board`);
      return;
    }

    if (tool === 'erase') {
      if (!accepts(e)) return;

      // A bounce is not a second tap. Same guard the stroke start needs.
      if (erasing) {
        if (performance.now() - strokeAt.current < CHATTER_MS) return;
        setErasing(false);
        tapGuard.current = performance.now() + CHATTER_MS;
        return;
      }

      // One snapshot for the whole sweep, so stepping back restores every line
      // the pen went over rather than the last few samples of it.
      remember();
      strokeAt.current = performance.now();
      setErasing(true);
      eraseUnder(at, svg);
      return;
    }

    if (tool === 'draw') {
      if (!accepts(e)) return;

      // A second tap ends the route. One tap starts it, the pen draws the shape
      // in between whether or not it is touching the glass.
      if (stroke.current) {
        // A bounce is not a second tap. Without this, the contact that follows
        // a starting tap by 10 to 25ms ends the stroke before it has begun.
        if (performance.now() - strokeAt.current < CHATTER_MS) {
          if (TRACING) trace(`${describeEvent(e, at)}\n            -> bounce ignored, still drawing`);
          return;
        }
        stroke.current.push({ x: e.clientX, y: e.clientY });
        if (TRACING) trace(`${describeEvent(e, at)}\n            -> stroke finished by tap`);
        commitStroke();
        return;
      }

      stroke.current = [{ x: e.clientX, y: e.clientY }];
      strokeAt.current = performance.now();
      strokeOwner.current = nearestPlayer(visible, at, INK_OWNER_YARDS)?.id ?? null;
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(commitStroke, INK_IDLE_MS);
      if (TRACING) {
        trace(
          `${describeEvent(e, at)}\n            -> stroke started` +
            `${strokeOwner.current ? ` for ${byId(strokeOwner.current)?.label}` : ' (annotation)'}`,
        );
      }
      return;
    }

    /*
     * The S Pen breaks contact constantly. Traced on a Galaxy Ultra, one
     * deliberate press arrived as five pointerdown/pointerup pairs inside
     * 150ms, every one reporting pressure 0.00. So a bounce close in time and
     * space to a drag that just ended is the same gesture continuing, not a new
     * tap: resume the player already in hand rather than re-picking. Without
     * this, a bounce landing in open grass cleared the selection mid-drag.
     */
    const now = performance.now();

    /*
     * Carrying beats every other interpretation of a tap. The window guards
     * against this pen's contact bounce dropping the player the instant it was
     * picked up, since a bounce arrives 10 to 25ms after the tap that lifted it.
     */
    if (carry.current) {
      if (now - carry.current.at > CHATTER_MS) dropCarried('tapped down');
      return;
    }

    const bounce = lastDrop.current;
    if (
      tool === 'select' &&
      bounce &&
      now - bounce.at < CHATTER_MS &&
      Math.hypot(bounce.x - at.x, bounce.y - at.y) < CHATTER_YARDS
    ) {
      const held = bounce.kind === 'player' ? byId(bounce.id) : null;
      if (held || bounce.kind !== 'player') {
        /*
         * Carry the original grab offset rather than deriving a new one from
         * the player's position. Bounces land 10-25ms apart, inside a single
         * frame, so a re-render is not guaranteed and that position may be
         * stale. Keeping the offset also means the player tracks the pen
         * across the break, which is what a continuing gesture should do.
         */
        // Keep the original grab point too, so the slop is measured across the
        // whole gesture rather than restarting at every bounce.
        drag.current = {
          kind: bounce.kind,
          id: bounce.id,
          dx: bounce.dx,
          dy: bounce.dy,
          ox: bounce.ox,
          oy: bounce.oy,
          moved: bounce.moved,
        };
        if (held) setSel({ kind: 'player', id: held.id });
        try {
          stageRef.current?.setPointerCapture(e.pointerId);
        } catch {
          /* not fatal */
        }
        const moved = applyDrag(svg, drag.current, at, { x: e.clientX, y: e.clientY });
        if (TRACING) {
          trace(
            `${describeEvent(e, at)}\n            -> RESUMED ${held?.label ?? bounce.kind} ` +
              `(contact bounce, ${(now - bounce.at).toFixed(0)}ms gap)` +
              `${moved ? ' + moved' : ', within slop'}`,
          );
        }
        return;
      }
    }

    const radius = pickRadius(svg);

    /*
     * One rule for what a tap is asking for, shared by every mode.
     *
     * A tap inside a player's mark is that player even when a line runs under
     * him. Measured on the device: five taps in a row 0.22 to 0.67 yards from a
     * guard, every one inside his mark, all selected the block line instead,
     * which is what "the pen will not select unless I press hard" turned out to
     * be. Pressing hard simply landed nearer his exact centre than the line.
     */
    /*
     * Routes mode picks lines too, but it never selects one.
     *
     * It used to be given nothing, so a tap on a receiver's own route landed on
     * open grass and cleared him — and his colour swatches with him. The line
     * resolves to the man who runs it instead, which opens the picker the
     * swatches are already in. So tapping a route is another way of tapping its
     * player, and there is still no line inspector over the board in Routes.
     */
    const lines = tool === 'select' || tool === 'routes' ? drawn : [];
    const hit = pickAt(visible, lines, at, radius, PLAYER_R);
    const p = hit?.kind === 'player' ? byId(hit.id) : null;

    if (hit?.kind === 'assignment' && tool === 'routes') {
      const owner = byId(drawn.find((a) => a.id === hit.id)?.playerId);
      if (TRACING) {
        trace(
          `${describeEvent(e, at)}\n            -> a line at ${hit.distance.toFixed(2)}yd, ` +
            `opening ${owner?.label ?? 'nobody'}`,
        );
      }
      setSel(owner ? { kind: 'player', id: owner.id } : null);
      setPending(null);
      tapGuard.current = performance.now() + CHATTER_MS;
      return;
    }

    if (hit?.kind === 'assignment') {
      if (TRACING) {
        trace(
          `${describeEvent(e, at)}\n            -> picked a line at ${hit.distance.toFixed(2)}yd`,
        );
      }
      setPending(null);
      setSel({ kind: 'assignment', id: hit.id });
      return;
    }

    if (TRACING) {
      trace(
        `${describeEvent(e, at)}\n            -> ${
          p ? `picked ${p.label} at ${hit!.distance.toFixed(2)}yd` : 'NOTHING'
        } (radius ${radius.toFixed(2)}yd, tool ${tool})`,
      );
    }

    /*
     * Routes mode selects and nothing else. The man stays exactly where he is,
     * because choosing what he runs should never cost you the spot you spent a
     * drag putting him on.
     */
    if (tool === 'routes') {
      /*
       * The cone is swung here too, not only in Move. It is switched on from
       * this man's route list, and sending the coach to another mode to aim it
       * would be the two-trips problem the route picker exists to end. Nothing
       * about it moves a player, so the mode's own rule still holds.
       */
      const swing = p ? null : grabHighlight(at);
      if (swing) {
        drag.current = swing;
        gestureRemembered.current = false;
        try {
          stageRef.current?.setPointerCapture(e.pointerId);
        } catch {
          /* not fatal */
        }
        if (TRACING) trace(`${describeEvent(e, at)}\n            -> moving the ${swing.kind}`);
        return;
      }
      setSel(p ? { kind: 'player', id: p.id } : null);
      setPending(null);
      tapGuard.current = performance.now() + CHATTER_MS;
      return;
    }

    if (!p) {
      /*
       * Nobody there — so the cone gets its turn. It lies under the board and
       * covers a lot of grass, which is why this comes after the players and
       * the lines rather than before them.
       */
      const handle = grabHighlight(at);
      if (handle) {
        drag.current = handle;
        gestureRemembered.current = false;
        setSel(null);
        try {
          stageRef.current?.setPointerCapture(e.pointerId);
        } catch {
          /* not fatal */
        }
        if (TRACING) trace(`${describeEvent(e, at)}\n            -> grabbed the ${handle.kind}`);
        return;
      }
      setSel(null);
      setPending(null);
      return;
    }

    if (tool !== 'select') {
      handlePairTap(p);
      return;
    }

    drag.current = {
      kind: 'player',
      id: p.id,
      dx: p.x - at.x,
      dy: p.y - at.y,
      ox: at.x,
      oy: at.y,
      moved: false,
    };
    // A bounce resuming a drag deliberately does not reset this: it is the same
    // gesture continuing, and it must not cost a second step of undo.
    gestureRemembered.current = false;
    setSel({ kind: 'player', id: p.id });
    // Capture can throw if the pointer is already gone. The drag survives
    // without it, because every move bubbles back to this same element.
    try {
      stageRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* not fatal */
    }
  }

  /**
   * A tap inside one of the highlights, which are their own grab handles.
   *
   * Neither has anything to aim at on purpose: a handle out at the far end read
   * as another player among the routes, and the wash is a far bigger target,
   * which is what this stylus needs — Chrome hit-tests it at the exact pixel.
   *
   * Reached only once the players and the lines have had their turn, so a
   * highlight spread across the backfield can never be what a tap on the man
   * standing in it picks up. The squares go first: they are small and placed
   * deliberately, where the cone is a wide wash that would swallow them.
   */
  function grabHighlight(at: Yards): DragState | null {
    const base = { ox: at.x, oy: at.y, moved: false };

    /*
     * Corners before bodies, and zones before either highlight.
     *
     * A corner is a small deliberate target sitting on top of the box it sizes,
     * so it has to be asked first or it could never be hit at all. Then the
     * boxes: a zone is placed where a coach put it, where the cone is a wide
     * wash across the whole backfield that would otherwise swallow anything
     * lying inside it. Same argument the squares already won against the cone.
     */
    for (const z of zones) {
      if (!onCorner(z, at)) continue;
      const c = zoneCorner(z);
      return { kind: 'zone-size', id: z.playerId, dx: c.x - at.x, dy: c.y - at.y, ...base };
    }

    for (const z of zones) {
      if (!insideZone(z, at)) continue;
      // Grab it by its middle, so the box keeps its position under the pen
      // instead of jumping its centre to wherever the tap landed.
      return { kind: 'zone', id: z.playerId, dx: z.x - at.x, dy: z.y - at.y, ...base };
    }

    for (const f of focuses) {
      const man = byId(f.playerId);
      if (!man || !insideFocus(man, f, at)) continue;
      // Drag from the far end, not from where the tap landed, or grabbing the
      // near edge would collapse the square onto the pen.
      return {
        kind: 'focus',
        id: f.playerId,
        dx: man.x + f.dx - at.x,
        dy: man.y + f.dy - at.y,
        ...base,
      };
    }

    // Not drawn without a quarterback, and a cone you cannot see is one you
    // cannot mean to grab.
    if (vision && qb && insideCone(qb, vision, at)) {
      return {
        kind: 'vision',
        id: VISION_ID,
        // Swing it from where the focus is, not from where the tap landed, or
        // grabbing the wide part of the wash would snap the look sideways.
        dx: vision.x - at.x,
        dy: vision.y - at.y,
        ...base,
      };
    }

    return null;
  }

  /**
   * Show the quarterback's line of sight, or stop showing it.
   *
   * Starts eight yards straight downfield of him, which is a look rather than a
   * guess: it is on the board and obviously there, where a zero-length cone at
   * his feet would read as the feature having failed.
   */
  function toggleVision() {
    remember();
    if (vision) {
      setVision(null);
      return;
    }
    if (!qb) return;
    setVision({ x: qb.x, y: clamp(qb.y - 8, -VIEW.downfield + 1, VIEW.behind - 1) });
  }

  /**
   * Put a focus square on this man, or take it off. Any number may wear one.
   *
   * It starts six yards out in front of him for the same reason the cone starts
   * eight yards downfield: a square with no reach at all would read as the
   * feature having failed rather than as something waiting to be dragged.
   */
  function toggleFocus(player: PlayerSlot) {
    remember();
    setFocuses((prev) =>
      prev.some((f) => f.playerId === player.id)
        ? prev.filter((f) => f.playerId !== player.id)
        : [...prev, defaultFocus(player)],
    );
  }

  /**
   * Rub out ink under the pen.
   *
   * Annotations erase partially, which is what the freehand layer is for. A
   * route or a block is a single assignment and goes whole, matching what the
   * Delete button in the inspector does, because half a block line means
   * nothing to anyone reading the sheet.
   */
  function eraseUnder(at: Yards, svg: SVGSVGElement) {
    const radius = Math.max(0.7, pxToYards(svg, 26));
    const left = eraseAt(annotations, at, radius);
    if (left) {
      setAnnotations(left);
      return;
    }
    const line = nearestAssignment(drawn, at, radius);
    if (line) {
      // Whole, as Delete does — and a stunt's two halves go together, because
      // rubbing out one of them would leave a man looping behind nobody.
      setAssignments((prev) => {
        const partner = stuntPartner(line, prev);
        return prev.filter((a) => a.id !== line.id && a.id !== partner?.id);
      });
      setSel(null);
    }
  }

  /**
   * A stunt is two lines and one decision, so deleting either end takes both.
   * Half a line game on a sheet is a man looping behind nobody.
   */
  function deleteAssignment(id: string) {
    remember();
    setAssignments((prev) => {
      const going = prev.find((a) => a.id === id);
      const partner = going ? stuntPartner(going, prev) : null;
      return prev.filter((a) => a.id !== id && a.id !== partner?.id);
    });
    setSel(null);
  }

  /** A base block and a pull differ only in the path, so the swap is free. */
  function retype(id: string, kind: 'block' | 'pull') {
    remember();
    setAssignments((prev) => prev.map((a) => (a.id === id ? { ...a, kind } : a)));
  }

  /** Undefined puts the line back under whatever the automatic rule says. */
  function recolor(id: string, color: string | undefined) {
    remember();
    setAssignments((prev) => prev.map((a) => (a.id === id ? { ...a, color } : a)));
  }

  /**
   * Put a kid in this slot, or take him out.
   *
   * The slot stores his shirt number rather than a roster id, which is the
   * spec's model and also the thing that is drawn on the board. Undoable like
   * any other edit to a player.
   */
  function assignJersey(playerId: string, jersey: number | undefined) {
    remember();
    setPlayers((prev) =>
      prev.map((p) => (p.id === playerId ? { ...p, jersey } : p)),
    );
  }

  /**
   * What this man is drawn as.
   *
   * The mark is the player's, not the play's, so it travels inside a saved
   * formation the way his label and his spot do — a team that draws its ends
   * as stars draws them that way in every play built on that formation.
   * Undoable like any other edit to a player.
   */
  function setShape(shape: ShapeKind) {
    if (!selectedPlayer) return;
    remember();
    setPlayers((prev) =>
      prev.map((p) => (p.id === selectedPlayer.id ? { ...p, shape } : p)),
    );
  }

  function toggleOnLine() {
    if (!selectedPlayer) return;
    remember();
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === selectedPlayer.id ? { ...p, onLine: !p.onLine, onLineLocked: true } : p,
      ),
    );
  }

  function releaseLock() {
    if (!selectedPlayer) return;
    remember();
    setPlayers((prev) =>
      applyOnLine(
        prev.map((p) => (p.id === selectedPlayer.id ? { ...p, onLineLocked: false } : p)),
        settings,
      ),
    );
  }

  function rename(label: string) {
    if (!selectedPlayer) return;
    setPlayers((prev) =>
      prev.map((p) => (p.id === selectedPlayer.id ? { ...p, label: label.slice(0, 3) } : p)),
    );
  }

  /**
   * This one play as a file.
   *
   * Exports what is in hand rather than what was last autosaved, so a sheet
   * printed mid-edit matches the board. The name is the play's, slugged, so a
   * folder of these sorts the way the playbook does.
   */
  async function exportPlay(kind: 'pdf' | 'png') {
    const current = {
      ...play,
      name,
      players,
      assignments,
      annotations,
      ballCarrierId: ballCarrierId ?? undefined,
    };
    const slug =
      playTitle(current)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'play';
    setExporting(true);
    try {
      if (kind === 'pdf') {
        download(
          await singlePlayPdf(current, { showHoles, showGaps }, roster),
          `${slug}-${stamp()}.pdf`,
          'application/pdf',
        );
      } else {
        // 2000px across is a little over 300 DPI at the width this prints.
        // What is on the board is what prints: if the gap letters are up while
        // the play is being drawn, the sheet that comes out has them too.
        const bytes = await playToPng(current, 2000, { showHoles, showGaps, showDefense });
        download(bytes, `${slug}-${stamp()}.png`, 'image/png');
      }
    } finally {
      setExporting(false);
    }
  }

  /**
   * Save now.
   *
   * Everything is already on this device — writeLocal runs synchronously on
   * every change — so this is really "push to the cloud without waiting out the
   * debounce". It says so afterwards, because a save button that does nothing
   * visible is a save button nobody trusts.
   */
  async function saveNow() {
    if (saving) return;
    setSaving(true);
    try {
      await onSave();
      setSaved(Date.now());
    } finally {
      setSaving(false);
    }
  }

  /**
   * Back to an empty play. It had no confirmation at all, sitting one button
   * along from Step back in the same grey — now it wears the danger colour and
   * asks, because it throws away everything drawn since the play was made.
   */
  async function reset() {
    const ok = await askConfirm('Start this play over?', {
      body: 'Every line, every zone and the formation go back to where a new play starts.',
      confirmLabel: 'Start over',
      danger: true,
    });
    if (!ok) return;
    dropCarried('reset');
    remember();
    setPlayers(initialPlayers(unit));
    setAssignments([]);
    setAnnotations([]);
    setBallCarrierId(null);
    setVision(null);
    setFocuses([]);
    setZones([]);
    setSel(null);
    setPending(null);
    setTool('routes');
    setShowDefense(unit === 'defense');
    closeDrawerAfter();
  }

  return (
    <div className="editor">
      <header>
        <button className="back" onClick={onClose} aria-label="Back to playbook">
          ‹
        </button>
        <input
          className="play-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={play.suggestedName || 'Name this play'}
          spellCheck={false}
          aria-label="Play name"
        />
        <LegalityBadge
          onLine={onLine}
          minOnLine={settings.minOnLine}
          issues={issues}
          unit={unit}
          defenders={defense.length}
          onBall={defense.filter((p) => p.y > -2.6).length}
        />
      </header>

      {/*
        * Pointer listeners live on this div, not on the <svg>. The stylus
        * diagnostic, the one build confirmed to take S Pen input on the target
        * device, listens on a plain HTML element too. The svg fills the div
        * exactly, so screen-to-yards is unaffected.
        */}
      <div
        className="stage"
        ref={stageRef}
        onPointerDown={handleStageDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onPointerLeave={clearAim}
      >
        <svg ref={svgRef} viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
          <Field
            holes={holes}
            showHoles={showHoles}
            occupied={occupied}
            gaps={gaps}
            showGaps={showGaps}
          />

          {/*
            * Both highlights, immediately after the turf and before a single
            * mark. They are a wash under the play, not over it: the routes, the
            * blocks and the men all have to stay exactly as readable with one
            * switched on as without.
            */}
          {/*
            * Zones first of the three, because a coverage is the widest wash on
            * the board and the other two have to stay legible on top of it.
            */}
          {zones.map((z) => (
            <ZoneArea
              key={`zone${z.playerId}`}
              zone={z}
              player={byId(z.playerId)}
              selected={sel?.kind === 'player' && sel.id === z.playerId}
            />
          ))}
          {focuses.map((f) => {
            const man = byId(f.playerId);
            return man ? <FocusSquare key={`focus${f.playerId}`} player={man} focus={f} /> : null;
          })}
          {vision && qb && <VisionCone qb={qb} vision={vision} />}

          {annotations.map((path, i) => (
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

          {drawn.map((a) => (
            <AssignmentPath
              key={a.id}
              assignment={a}
              autoColor={autoRouteColor(a, players)}
              selected={sel?.kind === 'assignment' && sel.id === a.id}
            />
          ))}

          {visible.map((p) => (
            <PlayerShape
              key={p.id}
              player={p}
              selected={sel?.kind === 'player' && sel.id === p.id}
              hovered={p.id === hoverId}
              ball={p.id === ballCarrierId}
              pending={
                p.id === pending?.blockerId || p.id === pending?.targetId || p.id === carrying
              }
            />
          ))}

          {/* Above the players, so the tip is never hidden under a mark. */}
          <g ref={aimRef} opacity="0" pointerEvents="none">
            <circle
              ref={ringRef}
              r={1.8}
              fill="none"
              stroke="var(--hover)"
              strokeWidth={0.07}
              strokeDasharray="0.34 0.3"
              opacity={0.45}
            />
            <g stroke="var(--hover)" strokeWidth={0.1} strokeLinecap="round">
              <line x1={-0.55} x2={-0.16} y1={0} y2={0} />
              <line x1={0.16} x2={0.55} y1={0} y2={0} />
              <line x1={0} x2={0} y1={-0.55} y2={-0.16} />
              <line x1={0} x2={0} y1={0.16} y2={0.55} />
            </g>
          </g>
        </svg>

        <LiveInkCanvas ref={ink} />

      {selectedBlock && (
        <div
          className={`inspector ${inspectorSide} ${inspectorEnd(
            byId(selectedBlock.playerId)?.side,
          )}`}
        >
          <div className="row">
            <strong>{describeAssignment(selectedBlock, players)}</strong>
          </div>
          <div className="row">
            {(selectedBlock.kind === 'block' || selectedBlock.kind === 'pull') && (
              <>
                <button
                  aria-pressed={selectedBlock.kind === 'block'}
                  onClick={() => retype(selectedBlock.id, 'block')}
                >
                  Base
                </button>
                <button
                  aria-pressed={selectedBlock.kind === 'pull'}
                  onClick={() => retype(selectedBlock.id, 'pull')}
                >
                  Pull
                </button>
              </>
            )}
            <button className="quiet" onClick={() => deleteAssignment(selectedBlock.id)}>
              Delete
            </button>
          </div>

          {/*
            * Colour is per line, not per player, so a receiver running a route
            * and carrying the ball on a reverse can read as two different
            * things. Auto colouring is per receiver, which covers the common
            * case; this row is for the one line that needs to stand out.
            */}
          <div className="row swatches">
            {SWATCHES.map((c) => (
              <button
                key={c}
                className="swatch"
                style={{ background: c }}
                aria-label={`Colour ${c}`}
                aria-pressed={selectedBlock.color === c}
                onClick={() => recolor(selectedBlock.id, c)}
              />
            ))}
            {selectedBlock.color !== undefined && (
              <button className="quiet" onClick={() => recolor(selectedBlock.id, undefined)}>
                Auto
              </button>
            )}
          </div>
        </div>
      )}

      {/*
        * Only the routes. The label, the on-line toggle and the coordinates all
        * moved into the drawer: they are set once when a formation is built and
        * then never again, and they were sitting on top of the board every time
        * a man was picked up.
        */}
      {selectedPlayer && tool !== 'select' && (
        <div className={`inspector ${inspectorSide} ${inspectorEnd(selectedPlayer.side)}`}>
          <RoutePicker
            player={selectedPlayer}
            /*
             * The panel turns into the defensive one for a man on that side,
             * whichever unit the play belongs to: a front dropped onto an
             * offensive play to block against is still a front, and giving one
             * of those defenders a zone is how you say what you expect him to
             * do about the route you just drew.
             */
            defense={
              selectedPlayer.side === 'defense'
                ? {
                    onPick: applyDefensePreset,
                    onZone: applyZonePreset,
                    hasZone: zones.some((z) => z.playerId === selectedPlayer.id),
                    onToggleZone: () => toggleZone(selectedPlayer),
                    /*
                     * What he is already doing, so the buttons that do it read
                     * as pressed. Without this the on/off rule is invisible:
                     * tapping the lit concept takes it off, and nothing in the
                     * row was saying which one was lit.
                     */
                    activeJob: jobOf(selectedPlayer.id)?.preset,
                    activeZone: zones.find((z) => z.playerId === selectedPlayer.id)?.preset,
                    hasCover: assignments.some(
                      (a) => a.playerId === selectedPlayer.id && a.kind === 'cover',
                    ),
                    onCoverNearest:
                      nearestReceiver(selectedPlayer) ||
                      assignments.some(
                        (a) => a.playerId === selectedPlayer.id && a.kind === 'cover',
                      )
                        ? () => coverNearest(selectedPlayer)
                        : null,
                  }
                : undefined
            }
            custom={customRoutes.map(toPreset)}
            activeRoute={routeOf(selectedPlayer.id)?.preset}
            onPick={applyRoute}
            onDeleteCustom={deleteCustomRoute}
            onSaveDrawn={
              routeOf(selectedPlayer.id) ? () => void saveDrawnRoute(selectedPlayer) : null
            }
            onClear={routeOf(selectedPlayer.id) ? () => clearRoute(selectedPlayer.id) : null}
            onFlip={routeOf(selectedPlayer.id) ? () => flipRoute(selectedPlayer) : null}
            hasBall={ballCarrierId === selectedPlayer.id}
            onGiveBall={() => giveBall(selectedPlayer.id)}
            hasFocus={focuses.some((f) => f.playerId === selectedPlayer.id)}
            onFocus={() => toggleFocus(selectedPlayer)}
            hasVision={vision !== null}
            onVision={selectedPlayer.id === qb?.id ? toggleVision : null}
            onShape={setShape}
            swatches={SWATCHES}
            color={routeOf(selectedPlayer.id)?.color}
            onColor={
              routeOf(selectedPlayer.id)
                ? (c) => recolor(routeOf(selectedPlayer.id)!.id, c)
                : null
            }
          />
        </div>
      )}

      {/*
        * The handful of actions worth reaching without opening anything, each
        * one present only while it would do something. The container is inert
        * and sits opposite the drawer, so it never competes with the tab.
        */}
      <div className={`quick-bar ${settings.drawerSide === 'right' ? 'left' : 'right'}`}>
        {carrying && (
          <button className="quick place" onClick={() => dropCarried('quick bar')}>
            {carrying === PAN_ID ? 'Set the board' : `Place ${byId(carrying)?.label ?? ''}`}
          </button>
        )}
        {selectedBlock && (
          <button className="quick" onClick={() => deleteAssignment(selectedBlock.id)}>
            Delete line
          </button>
        )}
        {canUndo && (
          <button className="quick" onClick={stepBack} aria-label="Undo">
            ↶
          </button>
        )}
        {canRedo && (
          <button className="quick" onClick={stepForward} aria-label="Redo">
            ↷
          </button>
        )}

        {/* Freehand is a thing you reach for mid-play, not a mode you set out in. */}
        <button
          className={tool === 'draw' ? 'quick pencil on' : 'quick pencil'}
          aria-pressed={tool === 'draw'}
          aria-label={tool === 'draw' ? 'Stop drawing freehand' : 'Draw freehand'}
          onClick={() => handleTool(tool === 'draw' ? 'routes' : 'draw')}
        >
          ✎
        </button>

        <div className="zoom">
          {/*
            * Sliding the board, beside magnifying it, because they are the same
            * kind of thing: neither one changes a line on the play. It is a
            * toggle and not a one-shot — you slide, look, slide again — and it
            * drops whatever is in hand on the way in, or a player picked up a
            * moment ago would still be following the pen that is now moving the
            * field out from under him.
            */}
          <button
            className={panning ? 'quick pan on' : 'quick pan'}
            aria-pressed={panning}
            aria-label={panning ? 'Stop moving the board' : 'Move the board'}
            onClick={() => {
              if (carrying) dropCarried('board tool');
              setPanning((v) => !v);
            }}
          >
            ✥
          </button>
          <button
            className="quick"
            aria-label="Zoom in"
            disabled={zoom >= 2.5}
            onClick={() => setZoom((z) => Math.min(2.5, +(z * 1.25).toFixed(3)))}
          >
            +
          </button>
          <button
            className="quick"
            aria-label="Zoom out"
            disabled={zoom <= 0.7}
            onClick={() => setZoom((z) => Math.max(0.7, +(z / 1.25).toFixed(3)))}
          >
            −
          </button>
          {/* One way back to the top of the field, whichever of the two moved it. */}
          {viewMoved && (
            <button className="quick" aria-label="Back to the whole field" onClick={resetView}>
              {zoom !== 1 ? `${Math.round(zoom * 100)}%` : 'Centre'}
            </button>
          )}
        </div>
      </div>

      <Drawer
        open={drawerOpen}
        onToggle={toggleDrawer}
        side={settings.drawerSide}
        title={drawerTitle}
        subtitle={drawerSubtitle}
        onBack={picker ? () => setPicker(null) : undefined}
        /* A form rather than a palette: give it the width to be read. */
        wide={picker === 'settings' || picker === 'notes'}
      >
        {picker === 'settings' ? (
          <SettingsPanel settings={settings} />
        ) : picker === 'notes' ? (
          <NotesPanel
            coachingPoint={coachingPoint}
            notes={notes}
            tags={tags}
            onCoachingPoint={setCoachingPoint}
            onNotes={setNotes}
            onTags={setTags}
          />
        ) : (
          <>
            {picker === 'defense' && (
              <DefensePanel
                library={library}
                scoutPlayId={scoutPlayId}
                onCoverage={applyCoveragePreset}
                onScout={applyScout}
              />
            )}

            {picker === 'formation' && (
              <FormationPicker
                formations={formations}
                unit={unit}
                foundationId={foundationId}
                onApply={applyFormation}
                onSave={() => void saveFormation()}
                onDelete={deleteFormation}
                onSetFoundation={setFoundation}
              />
            )}

            {/*
              * Grouped by what each button does to the play rather than listed
              * flat. Sixteen unlabelled pills all looked equally important and
              * none of them said what they were for.
              */}
            <section className="tool-group">
              <h4>Mode</h4>
              <BlockTool tool={tool} unit={unit} onTool={handleTool} />
            </section>

            {selectedPlayer && (
              <section className="tool-group">
                <h4>{selectedPlayer.label}</h4>
                <div className="player-row">
                  <label>
                    <span>Label</span>
                    <input
                      value={selectedPlayer.label}
                      onChange={(e) => rename(e.target.value)}
                      maxLength={3}
                      spellCheck={false}
                    />
                  </label>
                </div>
                {/* Nobody hands a defender the ball, so he is not offered it. */}
                {selectedPlayer.side === 'offense' && (
                  <div className="tools">
                    <button
                      aria-pressed={ballCarrierId === selectedPlayer.id}
                      onClick={() => giveBall(selectedPlayer.id)}
                    >
                      ★ Ball
                    </button>
                  </div>
                )}
                {/*
                  * Who is in this slot. Only offered once there is a team sheet
                  * to pick from — an empty dropdown asking a question the app
                  * has given you no way to answer is worse than no dropdown.
                  */}
                {roster.length > 0 && (
                  <div className="player-row">
                    <label>
                      <span>Who</span>
                      <select
                        value={selectedPlayer.jersey ?? ''}
                        onChange={(e) =>
                          assignJersey(
                            selectedPlayer.id,
                            e.target.value === '' ? undefined : Number(e.target.value),
                          )
                        }
                      >
                        <option value="">Nobody yet</option>
                        {byJersey(roster).map((entry) => (
                          <option key={entry.id} value={entry.jersey}>
                            {entry.jersey} {entry.name || '—'}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
                {selectedPlayer.side === 'offense' && (
                  <div className="tools">
                    <button aria-pressed={selectedPlayer.onLine} onClick={toggleOnLine}>
                      {selectedPlayer.onLine ? 'On the line' : 'In the backfield'}
                    </button>
                    {selectedPlayer.onLineLocked && (
                      <button className="quiet" onClick={releaseLock}>
                        Back to auto
                      </button>
                    )}
                  </div>
                )}
                <p className="tool-note">
                  {selectedPlayer.x.toFixed(2)} yd across, {selectedPlayer.y.toFixed(2)} yd from
                  the line
                  {selectedPlayer.backNumber ? ` · back ${selectedPlayer.backNumber}` : ''}
                  {whoIs(roster, selectedPlayer)?.name
                    ? ` · ${whoIs(roster, selectedPlayer)!.name}`
                    : ''}
                </p>
              </section>
            )}

            <section className="tool-group">
              <h4>Assign</h4>
              <div className="tools">
                <button
                  onClick={() => setPicker((v) => (v === 'formation' ? null : 'formation'))}
                  aria-pressed={picker === 'formation'}
                >
                  {unit === 'defense' ? 'Front' : 'Formation'}
                </button>
                {/*
                  * The two decisions that are about the whole board rather than
                  * one man, and the only defensive controls in the drawer: the
                  * coverage, and which play this is drawn against.
                  */}
                {unit === 'defense' && (
                  <button
                    onClick={() => setPicker((v) => (v === 'defense' ? null : 'defense'))}
                    aria-pressed={picker === 'defense'}
                  >
                    Call
                  </button>
                )}
                <button onClick={mirror}>Flip sides</button>
                <button
                  className="quiet"
                  disabled={drawn.length + annotations.length + zones.length === 0}
                  onClick={() => {
                    remember();
                    setAssignments([]);
                    setAnnotations([]);
                    // The zones go with the lines: they are drawn work too, and
                    // a Clear that left seven boxes on the board would read as
                    // having failed.
                    setZones([]);
                    setSel(null);
                    setPending(null);
                  }}
                >
                  Clear {drawn.length + annotations.length + zones.length || ''}
                </button>
              </div>
              {/* What it is set against is a fact about the play; the line
                  telling you to tap a defender was an instruction, and it is
                  gone with the rest of them. */}
              {unit === 'defense' && scout && (
                <p className="tool-note">
                  Set against {scout.name || scout.suggestedName || 'a play'}.
                </p>
              )}
            </section>

            <section className="tool-group">
              <h4>Undo</h4>
              <div className="tools">
                <button disabled={!canUndo} onClick={stepBack}>
                  Step back
                </button>
                <button disabled={!canRedo} onClick={stepForward}>
                  Step forward
                </button>
              </div>
            </section>

            <section className="tool-group">
              <h4>Show</h4>
              <div className="tools">
                <button aria-pressed={showHoles} onClick={() => setShowHoles((v) => !v)}>
                  Hole numbers
                </button>
                {/*
                  * The gap letters: the same spaces as the holes, read from the
                  * other side of the ball. Above the line, where the numbers are
                  * below it, so both can be up at once.
                  */}
                <button aria-pressed={showGaps} onClick={() => setShowGaps((v) => !v)}>
                  Gap letters
                </button>
                {unit === 'offense' && (
                  <button aria-pressed={showDefense} onClick={handleDefense}>
                    {defenseExists ? 'Defense' : '+ Defense'}
                  </button>
                )}
              </div>
            </section>

            <section className="tool-group">
              <h4>This play</h4>
              <div className="tools">
                <button onClick={() => void saveNow()} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setPicker('notes')}>
                  Notes{tags.length ? ` · ${tags.length}` : ''}
                </button>
                <button disabled={exporting} onClick={() => void exportPlay('pdf')}>
                  {exporting ? 'Working…' : 'Print sheet'}
                </button>
                <button disabled={exporting} onClick={() => void exportPlay('png')}>
                  Save image
                </button>
              </div>
              {saved && Date.now() - saved < 4000 && (
                <p className="tool-note">Saved to the cloud.</p>
              )}
            </section>

            {/*
              * The app, not the play. Settings sat in the group above, between
              * Notes and Print sheet, which said it was something about this
              * play — it is the colours, the pen and the league rules, and it
              * is the same on every play in the book.
              */}
            <section className="tool-group">
              <h4>App</h4>
              <div className="tools">
                <button onClick={() => setPicker('settings')}>Settings</button>
              </div>
            </section>

            {/*
              * On its own at the bottom and wearing the one colour that means
              * "this throws work away". It used to sit in the Undo group, in
              * the same grey, one button along from Step back.
              */}
            <section className="tool-group">
              <div className="tools full">
                <button className="danger" onClick={() => void reset()}>
                  Start this play over
                </button>
              </div>
            </section>
          </>
        )}
      </Drawer>
      </div>

      {TRACING && <TracePanel />}
    </div>
  );
}
