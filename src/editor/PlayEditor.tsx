import { useEffect, useMemo, useRef, useState } from 'react';
import { computeHoles } from '../domain/holes';
import {
  applyOnLine,
  checkFormation,
  countOnLine,
  eligibleReceivers,
} from '../domain/legality';
import { describeAssignment } from '../domain/presets/blocks';
import { refreshPaths } from '../domain/regenerate';
import { computeGaps } from '../domain/gaps';
import { HOOPS_ACTIONS, makeShot } from '../domain/presets/hoops';
import { framesOf, nextFrame, type Frame } from '../domain/frames';
import { anyVariant, isHoops, viewOf } from '../sports';
import { Playback } from './Playback';
import { rulesFor, variantKey } from '../sports/football';
import {
  defensePresetById,
  type DefenseContext,
  type DefensePreset,
} from '../domain/presets/defense';
import { freeZone, type ZonePreset } from '../domain/presets/zones';
import { applyCoverage, type CoveragePreset } from '../domain/presets/coverages';
import { makeCover, stuntPartner } from '../domain/presets/links';
import {
  drawnSides,
  isBesideRoute,
  isBlockKind,
  isLinkKind,
  playSurface,
  type Assignment,
  type FieldSurface,
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
import { LiveInkCanvas, type InkHandle, type InkPoint } from '../render/LiveInkCanvas';
import { defaultFocus } from '../render/FocusSquare';
import {
  VIEW,
  clamp,
} from '../render/geometry';
import {
  mirrorAbout,
  mirrorAnnotations,
  mirrorAssignments,
  mirrorPlayers,
  mirrorZones,
} from '../domain/mirror';
import { SWATCHES } from '../domain/colors';
import { readRoster } from '../domain/roster';
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
  formationsFor,
  readFormations,
  readFoundationId,
  writeFormations,
  writeFoundationId,
} from '../domain/presets/formations';
import { askConfirm, askText } from '../ui/dialog';
import { useBackLayer } from '../ui/backstack';
import { UndoStack } from '../store/undo';
import { newId } from '../store/usePlaybook';
import {
  BlockTool,
  isPairTool,
  type Pending,
  type Tool,
} from './BlockTool';
import { Drawer } from './Drawer';
import { SettingsPanel } from './SettingsPanel';
import { NotesPanel } from './NotesPanel';
import { useSettings, getSettings, boardVars } from '../store/settings';
import { DefensePanel } from './DefensePanel';
import { FormationPicker } from './FormationPicker';
import { RoutePicker } from './RoutePicker';
import { TracePanel } from './TracePanel';
import { TRACING, describeEvent, trace } from './trace';
import { LegalityBadge } from './LegalityBadge';
import { PrintPanel } from '../export/PrintPanel';
import { download, playToPng, playTitle, slug, stamp } from '../export/render';
import { BoardLayers } from './BoardLayers';
import { LineInspector } from './LineInspector';
import { QuickBar } from './QuickBar';
import { Icon } from '../ui/Icon';
import { readDrawerOpen, writeDrawerOpen } from './drawerPrefs';
import { createPointer, type Pointer } from './pointer';
import {
  PAN_ID,
  type DragState,
  type Drop,
  type Selection,
  type Snapshot,
} from './gesture';

/**
 * Offense only; the defense goes on the board when it is asked for. Reset goes
 * back to the foundation rather than to the built-in set, so it means "start
 * this play over" rather than "throw away how this team lines up".
 */
function initialPlayers(unit: Side = 'offense', variant?: string): PlayerSlot[] {
  const settings = getSettings();
  // A defensive play starts as a front with a look to line up against: gaps are
  // computed from whoever is on the offensive line, so a defense with nobody
  // across from it has no gaps, no blitz aiming points and nothing to cover.
  return unit === 'defense'
    ? applyOnLine([...foundationOffense(variant), ...foundationDefense(variant)], settings)
    : applyOnLine(foundationOffense(variant), settings);
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
    () => drawnSides(play, getSettings().showDefense).defense,
  );
  /**
   * What this play is drawn on, when it has been set by hand.
   *
   * Undefined is the normal state and means "follow Settings", which is why
   * this holds the override rather than the resolved answer: storing the answer
   * would freeze every play the coach so much as opened, and then changing the
   * setting would redraw nothing. See `playSurface`.
   */
  const [surface, setSurface] = useState<FieldSurface | undefined>(() => play.surface);
  /** What the board actually is right now: this play's answer, or Settings'. */
  const boardSurface = playSurface({ ...play, surface }, settings.fieldSurface);
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
  /**
   * The look, taken off the board. Saved with the play rather than held for the
   * session, because it has to survive onto the sheet — see `hideOffense`.
   */
  const [hideOffense, setHideOffense] = useState(play.hideOffense ?? false);
  const [name, setName] = useState(play.name);
  const [notes, setNotes] = useState(play.notes);
  const [coachingPoint, setCoachingPoint] = useState(play.coachingPoint);
  const [tags, setTags] = useState<string[]>(play.tags);
  const [erasing, setErasing] = useState(false);
  const [picker, setPicker] = useState<
    'formation' | 'settings' | 'notes' | 'defense' | 'print' | null
  >(null);
  /*
   * A picker is a layer over the drawer and has its own back arrow, so the back
   * gesture matches it. The drawer itself deliberately is not one: opening and
   * closing it is a remembered preference, and a swipe should not rewrite what
   * the tools do next time the coach opens a play.
   */
  useBackLayer(Boolean(picker), () => setPicker(null));
  /*
   * Every saved set, of every kind of football: the list is written back
   * whole. `formations` is the part of it this play can line up in.
   */
  const [allFormations, setFormations] = useState<Formation[]>(readFormations);
  const formations = useMemo(
    () => formationsFor(allFormations, play.variant),
    [allFormations, play.variant],
  );
  const kind = useMemo(() => anyVariant(play.variant), [play.variant]);
  /* A court or a field: the seam the football-only parts of the editor hang on. */
  const hoops = isHoops(play.variant);
  const view = viewOf(play.variant);
  /* The starred set for this unit. The two sides star independently. */
  const [foundationId, setFoundationId] = useState<string | null>(() =>
    readFoundationId(play.unit ?? 'offense', play.variant),
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
   * Where the window is looking, in yards, as an offset from the default center.
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
    { kind: DragState['kind']; id: string; pt?: number; dx: number; dy: number; at: number } | null
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
  /*
   * The steps of the play. The four pieces of state above — the men, their
   * lines, the ink, the ball — are always the step that is showing, so every
   * tool in the editor works on a step without knowing there are any. `steps`
   * holds them all, and its entry for the step on screen is stale by design:
   * `allSteps` is the list with the live one put back in.
   */
  const [steps, setSteps] = useState<Frame[]>(() => framesOf(play));
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const allSteps = useMemo<Frame[]>(
    () =>
      steps.map((f, i) =>
        i === step
          ? { players, assignments, annotations, ...(ballCarrierId ? { ballCarrierId } : {}) }
          : f,
      ),
    [steps, step, players, assignments, annotations, ballCarrierId],
  );
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
  const lastDrop = useRef<Drop | null>(null);
  /**
   * The pointer handlers of the latest render.
   *
   * For anything that fires later than the render it was set up in: the raw
   * pointer listener is bound once per tool, and the timer that ends a stroke
   * runs most of a second after the last sample. Both used to call handlers
   * captured at binding time, and so acted on the board as it was then.
   */
  const pointerRef = useRef<Pointer | null>(null);

  /** The box, scaled and slid. Yards throughout, as ever. */
  const viewBox = useMemo(() => {
    const w = view.halfWidth * 2;
    const h = view.downfield + view.behind;
    // Center of the default box: the middle of the field, a little downfield.
    const cx = pan.x;
    const cy = (-view.downfield + view.behind) / 2 + pan.y;
    const zw = w / zoom;
    const zh = h / zoom;
    return `${cx - zw / 2} ${cy - zh / 2} ${zw} ${zh}`;
  }, [zoom, pan, view]);

  /** True when the window is anywhere but where it starts. */
  const viewMoved = zoom !== 1 || pan.x !== 0 || pan.y !== 0;

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  /**
   * Who is actually on the board, either side of the ball.
   *
   * Both halves can be taken off, for opposite reasons: an offensive play is
   * usually drawn without a front, and a defensive play can be drawn against
   * nobody. Hit testing reads this and not `players`, so a man who is not drawn
   * cannot be tapped, dragged or handed a route by accident.
   */
  const visible = useMemo(
    () => players.filter((p) => (p.side === 'defense' ? showDefense : !hideOffense)),
    [players, showDefense, hideOffense],
  );

  /**
   * Blocks are stored as who-blocks-whom, so the geometry is rebuilt from the
   * current positions rather than cached. Dragging either man redraws the line.
   */
  const drawn = useMemo(() => refreshPaths(assignments, players), [assignments, players]);

  /**
   * The lines belonging to men who are on the board.
   *
   * Regenerated from *all* the players above and only then filtered, because a
   * cover rope is a function of both ends: the defender still has the slot
   * receiver whether or not the receiver is drawn, and rebuilding from a
   * half-empty roster would straighten his rope out.
   *
   * Filtered on the owner alone. What a hidden man runs goes with him; what a
   * defender does about him stays, because that line is the defense's own drawn
   * work and this is a hide, not a delete. Everything that reads a line off the
   * board — the eraser, Select, the tap that opens a route's player — reads
   * this, so nothing invisible can be rubbed out or picked up.
   */
  const shown = useMemo(
    () => drawn.filter((a) => visible.some((p) => p.id === a.playerId)),
    [drawn, visible],
  );

  // settings belongs in both: the rules are live now, and changing which way
  // the even holes run has to renumber the board without touching a player.
  /*
   * The rules this play is held to: the coach's own for seven-man, the
   * variant's two numbers for every other kind.
   */
  const rules = useMemo(() => rulesFor(play.variant, settings), [play.variant, settings]);
  const holes = useMemo(() => computeHoles(players, rules), [players, rules]);
  /*
   * The gap map, the defensive twin of the holes and computed from exactly the
   * same men. Not stored, for the same reason: a blitz aimed at the B gap has
   * to find the B gap that exists now, after the tight end moved.
   */
  const gaps = useMemo(() => computeGaps(players), [players]);
  const issues = useMemo(() => checkFormation(players, rules), [players, rules]);
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
      : picker === 'print'
        ? 'Print'
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
      // The first step is the play, as it always was; the rest ride behind it.
      players: allSteps[0].players,
      assignments: allSteps[0].assignments,
      annotations: allSteps[0].annotations,
      ballCarrierId: allSteps[0].ballCarrierId,
      frames: allSteps.length > 1 ? allSteps.slice(1) : undefined,
      vision: vision ?? undefined,
      focuses: focuses.length ? focuses : undefined,
      zones: zones.length ? zones : undefined,
      unit: play.unit,
      defenseFormationId,
      scoutPlayId,
      hideOffense: hideOffense || undefined,
      /*
       * Written down as an explicit yes or no rather than only when hidden.
       * The absent case means "ask the device setting", and a play the coach
       * has had open and set is a play that has answered for itself — leaving
       * it absent would let a later change in Settings quietly redraw it. A
       * defensive play never stores one: the front is the play.
       */
      hideDefense: unit === 'defense' ? undefined : !showDefense,
      /*
       * Only when the coach has set this play by hand — undefined is not an
       * absence to be filled in, it is "follow Settings", and writing an answer
       * here on every save would quietly cut every play in the book loose from
       * the setting the first time it was opened.
       */
      surface,
      notes,
      coachingPoint,
      tags,
    });
    // play and onChange are stable for the life of one editing session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    name,
    // Every step, which is also the men, the lines, the ink and the ball.
    allSteps,
    vision,
    focuses,
    zones,
    defenseFormationId,
    scoutPlayId,
    hideOffense,
    showDefense,
    surface,
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
      if (stroke.current) pointerRef.current?.extendStroke(ev as PointerEvent);
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
    // A pass and a screen are between teammates: nobody across is needed.
    const needsFront = isPairTool(next) && next !== 'pass' && next !== 'screen';
    if (needsFront && !defenseExists) {
      setPlayers((prev) => applyOnLine([...prev, ...foundationDefense(play.variant)], settings));
    }
    if (needsFront) setShowDefense(true);
  }

  function handleDefense() {
    if (!defenseExists) {
      setPlayers((prev) => applyOnLine([...prev, ...foundationDefense(play.variant)], settings));
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
   * Put a step on the board.
   *
   * Undo starts over. A step back is a step back on the board in front of
   * you, and a stack that reached across steps would put one step's men onto
   * another's.
   */
  function showStep(all: Frame[], index: number) {
    dropCarried('step');
    const f = all[index];
    setSteps(all);
    setStep(index);
    setPlayers(f.players);
    setAssignments(f.assignments);
    setAnnotations(f.annotations);
    setBallCarrierId(f.ballCarrierId ?? null);
    setSel(null);
    setPending(null);
    undo.current = new UndoStack<Snapshot>();
    syncUndo();
  }

  /** A new step after this one: everybody where their line left them. */
  function addStep() {
    const all = [...allSteps.slice(0, step + 1), nextFrame(allSteps[step]), ...allSteps.slice(step + 1)];
    showStep(all, step + 1);
  }

  async function removeStep() {
    if (allSteps.length < 2) return;
    const ok = await askConfirm(`Remove step ${step + 1}?`, {
      body: 'Its lines go with it. The other steps stay as they are.',
      confirmLabel: 'Remove step',
      danger: true,
    });
    if (!ok) return;
    const all = allSteps.filter((_, i) => i !== step);
    showStep(all, Math.min(step, all.length - 1));
  }

  function togglePlay() {
    if (playing) {
      setPlaying(false);
      return;
    }
    dropCarried('play');
    setSel(null);
    setPending(null);
    // From the top, whichever step was showing: a play is run from the start.
    if (step !== 0) showStep(allSteps, 0);
    setPlaying(true);
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
      ...prev.filter(
        (a) => !(a.playerId === p.id && !isBlockKind(a.kind) && !isBesideRoute(a.kind)),
      ),
      {
        id: newId('a'),
        playerId: p.id,
        kind: preset.line ?? (preset.carry ? 'carry' : 'route'),
        path: preset.shape(p, hand),
        preset: preset.id,
        hand,
      },
    ]);
  }

  /** A shot is on or off: it starts wherever he ends up, so there is nothing to aim. */
  function toggleShot(p: PlayerSlot) {
    remember();
    setAssignments((prev) => {
      const rest = prev.filter((a) => !(a.playerId === p.id && a.kind === 'shot'));
      return rest.length < prev.length ? rest : [...rest, makeShot(p, rest)];
    });
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
    /*
     * A hand-picked color survives the change of concept. The color is a fact
     * about this man's grass — "the deep men are red" — not about which concept
     * drew it, and losing it every time a third became a half would make the
     * palette useless for the one thing it is for.
     */
    const color = zones.find((z) => z.playerId === p.id)?.color;
    setZones((prev) => [
      ...prev.filter((z) => z.playerId !== p.id),
      { playerId: p.id, ...shape, ...(color ? { color } : {}) },
    ]);
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
   * Eligible receivers only, computed from the board: covering the center is
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
    // Asking for a look is asking to see it. Picking one off the list and
    // getting an unchanged empty board would read as the tap having missed.
    setHideOffense(false);
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
    for (const r of HOOPS_ACTIONS) all.set(r.id, r);
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
    const def = current.preset && !current.edited ? defensePresetById(current.preset) : null;
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
    // A reshaped line is mirrored as drawn: regenerating it from the preset
    // would put the stock shape back over the coach's.
    const next = current.edited ? undefined : (twin ?? preset);

    setAssignments((prev) =>
      prev.map((a) => {
        if (a.id !== current.id) return a;
        if (a.edited) {
          return {
            ...a,
            ...(twin ? { preset: twin.id } : {}),
            hand: otherHand(was),
            path: mirrorAbout(a.path, a.path[0]?.x ?? player.x),
          };
        }
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
    return (
      assignments.find(
        (a) => a.playerId === playerId && !isBlockKind(a.kind) && !isBesideRoute(a.kind),
      ) ?? null
    );
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
    setAssignments((prev) =>
      prev.filter(
        (a) => !(a.playerId === playerId && !isBlockKind(a.kind) && !isBesideRoute(a.kind)),
      ),
    );
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
          ? 'Saves where this front is standing, to drop onto any play.'
          : 'Saves where this offense is standing, to drop onto any play.',
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
      ...(variantKey(play.variant) ? { variant: play.variant } : {}),
    };
    const all = [...allFormations, next];
    setFormations(all);
    writeFormations(all);
  }

  function deleteFormation(id: string) {
    const all = allFormations.filter((f) => f.id !== id);
    setFormations(all);
    writeFormations(all);
    // A foundation pointing at a formation that no longer exists would silently
    // fall back to the built-in set, which reads as the star being ignored.
    if (id === foundationId) setFoundation(null);
  }

  function setFoundation(id: string | null) {
    setFoundationId(id);
    writeFoundationId(id, unit, play.variant);
  }

  /*
   * The pointer handlers live in `pointer/`, built fresh on every render at the
   * foot of this component. These two are reached from further up — the undo
   * buttons, the Escape key, the quick bar — so they go through the latest set.
   */
  function dropCarried(reason: string) {
    pointerRef.current?.dropCarried(reason);
  }

  function clearAim() {
    pointerRef.current?.clearAim();
  }

  /**
   * The one handle on the selected man's line: its end.
   *
   * There was one on every corner, and dragging the break reshaped the route —
   * which is not what a coach adjusting a route means. The shape is the concept;
   * how deep it runs is the adjustment. So the end is the only grip, and moving
   * it slides the whole route deeper or shallower.
   */
  const routeHandles = useMemo(() => {
    if (tool !== 'routes' || !selectedPlayer) return [];
    const a = routeOf(selectedPlayer.id);
    if (!a || a.path.length < 2) return [];
    const pt = a.path.length - 1;
    return [{ id: a.id, pt, x: a.path[pt].x, y: a.path[pt].y }];
    // routeOf reads assignments, which is what this depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, selectedPlayer, assignments]);

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

  /** The same thing done to a man's patch of grass. Undefined is back to auto. */
  function recolorZone(playerId: string, color: string | undefined) {
    remember();
    setZones((prev) => prev.map((z) => (z.playerId === playerId ? { ...z, color } : z)));
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
  async function exportPlay() {
    const current = livePlay();
    setExporting(true);
    try {
      // 2000px across is a little over 300 DPI at the width this prints.
      // What is on the board is what prints: if the gap letters are up while
      // the play is being drawn, the sheet that comes out has them too.
      // Which sides are drawn rides on the play itself now, so it is not passed
      // again here — `current` is already carrying the board's answer.
      const bytes = await playToPng(current, 2000, { showHoles, showGaps });
      download(bytes, `${slug(playTitle(current), 'play')}-${stamp()}.png`, 'image/png');
    } finally {
      setExporting(false);
    }
  }

  /**
   * The play as it stands under the coach's hand, not as it was loaded.
   *
   * The editor holds the name, the men, the lines and the ink in its own state
   * and writes them back on a debounce, so anything that leaves the app —
   * a sheet, an image, the print preview — has to be built from that state
   * rather than from `play`, or it exports the version from before the last
   * few marks were made.
   */
  function livePlay(): Play {
    return {
      ...play,
      name,
      players,
      assignments,
      annotations,
      ballCarrierId: ballCarrierId ?? undefined,
      /*
       * Which sides are drawn, taken from the board and not from the prop.
       * The sheet and the exported image are rendered from this, and the prop
       * only catches up with a toggle on the render after it — which is one
       * render too late for a coach who hides the look and prints straight
       * away.
       */
      hideOffense: hideOffense || undefined,
      hideDefense: unit === 'defense' ? undefined : !showDefense,
      /* Likewise from the board, so a sheet printed straight after the toggle
         is the board the coach is looking at and not the one before it. */
      surface,
    };
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
   * along from Step back in the same gray — now it wears the danger color and
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
    setPlayers(initialPlayers(unit, play.variant));
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
    // A new defensive play starts with a look across from it, and this says it
    // goes back to where a new play starts.
    setHideOffense(false);
    closeDrawerAfter();
  }

  const pointer = createPointer({
    view,
    tool,
    panning,
    erasing,
    pending,
    pan,
    settings,
    visible,
    drawn,
    shown,
    annotations,
    zones,
    focuses,
    vision,
    qb,
    routeHandles,
    byId,
    remember,
    setPlayers,
    setAssignments,
    setAnnotations,
    setZones,
    setFocuses,
    setVision,
    setSel,
    setPending,
    setHoverId,
    setCarrying,
    setErasing,
    setPan,
    svgRef,
    stageRef,
    drag,
    carry,
    lastDrop,
    tapGuard,
    gestureRemembered,
    panFrom,
    moveCount,
    ink,
    stroke,
    strokeOwner,
    strokeAt,
    idleTimer,
    commitTimer,
    lastPenAt,
    lastRawAt,
    rawBound,
    aimRef,
    ringRef,
    hoverRef,
    aimQueued,
    live: () => pointerRef.current!,
  });
  pointerRef.current = pointer;

  return (
    <div className="editor">
      <header>
        <button className="back icon-button" onClick={onClose} aria-label="Back to playbook">
          <Icon name="back" size={22} />
        </button>
        <input
          className="play-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={play.suggestedName || 'Name this play'}
          spellCheck={false}
          aria-label="Play name"
        />
        {/* Nothing to count on a court: no line to fill and no rule about it. */}
        {!hoops && (
          <LegalityBadge
            onLine={onLine}
            minOnLine={rules.minOnLine}
            issues={issues}
            unit={unit}
            defenders={defense.length}
            onBall={defense.filter((p) => p.y > -2.6).length}
          />
        )}
      </header>

      {/*
        * Pointer listeners live on this div, not on the <svg>. The stylus
        * diagnostic, the one build confirmed to take S Pen input on the target
        * device, listens on a plain HTML element too. The svg fills the div
        * exactly, so screen-to-yards is unaffected.
        */}
      <div
        className="stage"
        /* Grass or white paper, for the field and everything drawn on it. The
           properties inherit, so the svg below and the ink canvas beside it
           both take them; the panels floating over the board do not. */
        style={boardVars(boardSurface)}
        ref={stageRef}
        /* While the play runs the board is a screen, and a tap stops it. */
        onPointerDown={
          playing
            ? (e) => {
                if ((e.target as Element).closest?.('.quick-bar, .drawer')) return;
                tapGuard.current = performance.now() + 300;
                setPlaying(false);
              }
            : pointer.handleStageDown
        }
        onPointerMove={pointer.handleMove}
        onPointerUp={pointer.handleUp}
        onPointerCancel={pointer.handleUp}
        onPointerLeave={clearAim}
      >
        <svg ref={svgRef} viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
          <BoardLayers
            court={hoops}
            fieldView={{
              x: -view.halfWidth,
              y: -view.downfield,
              w: view.halfWidth * 2,
              h: view.downfield + view.behind,
            }}
            holes={holes}
            showHoles={!hoops && showHoles}
            occupied={occupied}
            gaps={gaps}
            showGaps={!hoops && showGaps}
            players={players}
            visible={visible}
            shown={shown}
            byId={byId}
            zones={zones}
            focuses={focuses}
            vision={vision}
            qb={qb}
            hideOffense={hideOffense}
            annotations={annotations}
            sel={sel}
            hoverId={hoverId}
            ballCarrierId={ballCarrierId}
            pending={pending}
            carrying={carrying}
            routeHandles={routeHandles}
            aimRef={aimRef}
            ringRef={ringRef}
          />
        </svg>

        {/*
          * Keyed on the surface, so changing it remounts this.
          *
          * The canvas takes no custom properties — it resolves `--ink-route` to
          * a literal once, on mount — so a board switched from grass to white
          * would otherwise go on painting the live stroke in the pale blue that
          * has just become invisible. It holds nothing but an in-progress
          * stroke, and nobody changes this setting mid-stroke: the control is
          * two panels deep in a drawer.
          */}
        <LiveInkCanvas key={boardSurface} ref={ink} />
        {playing && (
          <Playback
            frames={allSteps}
            viewBox={viewBox}
            court={hoops}
            fieldView={{
              x: -view.halfWidth,
              y: -view.downfield,
              w: view.halfWidth * 2,
              h: view.downfield + view.behind,
            }}
            shows={(p) => (p.side === 'defense' ? showDefense : !hideOffense)}
            onStep={(i) => {
              if (i !== step) showStep(allSteps, i);
            }}
            onDone={() => setPlaying(false)}
          />
        )}

      {selectedBlock && (
        <LineInspector
          className={`inspector ${inspectorSide} ${inspectorEnd(
            byId(selectedBlock.playerId)?.side,
          )}`}
          line={selectedBlock}
          title={describeAssignment(selectedBlock, players)}
          onRetype={retype}
          onDelete={deleteAssignment}
          onRecolor={recolor}
        />
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
            hoops={
              hoops
                ? {
                    hasShot: assignments.some(
                      (a) => a.playerId === selectedPlayer.id && a.kind === 'shot',
                    ),
                    onShot: () => toggleShot(selectedPlayer),
                  }
                : undefined
            }
            /*
             * The panel turns into the defensive one for a man on that side,
             * whichever unit the play belongs to: a front dropped onto an
             * offensive play to block against is still a front, and giving one
             * of those defenders a zone is how you say what you expect him to
             * do about the route you just drew.
             */
            defense={
              selectedPlayer.side === 'defense' && !hoops
                ? {
                    onPick: applyDefensePreset,
                    blocking: kind.blocking,
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
                    zoneColor: zones.find((z) => z.playerId === selectedPlayer.id)?.color,
                    onZoneColor: zones.some((z) => z.playerId === selectedPlayer.id)
                      ? (c) => recolorZone(selectedPlayer.id, c)
                      : null,
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
            onRename={rename}
            roster={roster}
            onAssignJersey={(jersey) => assignJersey(selectedPlayer.id, jersey)}
            /* Only the offense has a line to be on. */
            onToggleOnLine={selectedPlayer.side === 'offense' && !hoops ? toggleOnLine : null}
            onReleaseLock={selectedPlayer.onLineLocked ? releaseLock : null}
          />
        </div>
      )}

      {/*
        * one present only while it would do something. The container is inert
        * and sits opposite the drawer, so it never competes with the tab.
        */}
      <QuickBar
        steps={{
          count: allSteps.length,
          index: step,
          playing,
          onGo: (i) => showStep(allSteps, i),
          onAdd: addStep,
          onRemove: () => void removeStep(),
          onPlay: togglePlay,
        }}
        side={settings.drawerSide === 'right' ? 'left' : 'right'}
        placeLabel={
          carrying
            ? carrying === PAN_ID
              ? 'Set the board'
              : `Place ${byId(carrying)?.label ?? ''}`
            : null
        }
        onPlace={() => dropCarried('quick bar')}
        onDeleteLine={selectedBlock ? () => deleteAssignment(selectedBlock.id) : null}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={stepBack}
        onRedo={stepForward}
        tool={tool}
        onTool={handleTool}
        panning={panning}
        onTogglePan={() => {
          // Drops whatever is in hand on the way in, or a player picked up a
          // moment ago would still be following the pen that is now moving the
          // field out from under him.
          if (carrying) dropCarried('board tool');
          setPanning((v) => !v);
        }}
        zoom={zoom}
        onZoom={setZoom}
        viewMoved={viewMoved}
        onResetView={resetView}
      />

      <Drawer
        open={drawerOpen}
        onToggle={toggleDrawer}
        side={settings.drawerSide}
        title={drawerTitle}
        subtitle={drawerSubtitle}
        onBack={picker ? () => setPicker(null) : undefined}
        /* A form rather than a palette: give it the width to be read. */
        wide={picker === 'settings' || picker === 'notes' || picker === 'print'}
      >
        {picker === 'settings' ? (
          <SettingsPanel settings={settings} />
        ) : picker === 'print' ? (
          /*
           * The same Print screen the playbook opens, pointed at this one play.
           *
           * It used to be a button that wrote a portrait sheet and gave no say
           * in it — which was the whole complaint about printing, arrived at
           * from the other direction. One play or the whole book, the options
           * are the options.
           */
          <PrintPanel plays={[livePlay()]} sections={[]} roster={roster} />
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
              * flat. Sixteen unlabeled pills all looked equally important and
              * none of them said what they were for.
              */}
            <section className="tool-group">
              <h4>Mode</h4>
              <BlockTool tool={tool} unit={unit} blocking={kind.blocking} hoops={hoops} onTool={handleTool} />
            </section>

            {/*
              * No player section here any more. Everything about the man in
              * hand — his label, who is in the slot, whether he is on the ball,
              * where he is standing — is on the board with him, behind Details
              * in the route picker. It sat in the drawer on the reasoning that a
              * formation is built once and never touched again; true of a
              * formation, but a man gets renamed and handed to a different kid
              * all season, and doing either meant leaving him to do it.
              */}
            <section className="tool-group">
              <h4>Assign</h4>
              <div className="tools">
                <button
                  onClick={() => setPicker((v) => (v === 'formation' ? null : 'formation'))}
                  aria-pressed={picker === 'formation'}
                >
                  {hoops ? 'Set' : unit === 'defense' ? 'Front' : 'Formation'}
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
              {unit === 'defense' &&
                (hideOffense ? (
                  /* Said plainly, because it is the one state where the board
                     is not the whole truth: the look is still on the play and
                     still lettering the gaps, it is only not being drawn. */
                  <p className="tool-note">
                    No offense shown. It stays off the printed sheet too.
                  </p>
                ) : (
                  scout && (
                    <p className="tool-note">
                      Set against {scout.name || scout.suggestedName || 'a play'}.
                    </p>
                  )
                ))}
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
                {!hoops && (
                  <button aria-pressed={showHoles} onClick={() => setShowHoles((v) => !v)}>
                    Hole numbers
                  </button>
                )}
                {/*
                  * The gap letters: the same spaces as the holes, read from the
                  * other side of the ball. Above the line, where the numbers are
                  * below it, so both can be up at once.
                  */}
                {!hoops && (
                  <button aria-pressed={showGaps} onClick={() => setShowGaps((v) => !v)}>
                    Gap letters
                  </button>
                )}
                {unit === 'offense' && (
                  <button aria-pressed={showDefense} onClick={handleDefense}>
                    {defenseExists ? 'Defense' : '+ Defense'}
                  </button>
                )}
                {/*
                  * The mirror of it, on the other side of the ball. Pressed is
                  * shown, exactly as Defense reads, so the two toggles behave
                  * the same way round — and unlike the other three in this row,
                  * this one is saved with the play, because a defensive card
                  * drawn against nobody has to print that way too.
                  */}
                {unit === 'defense' && (
                  <button
                    aria-pressed={!hideOffense}
                    /*
                     * Not pushed onto the undo stack. The snapshot is the drawn
                     * work — players, lines, washes — and this changes none of
                     * it; a step that restored an identical board would be a
                     * Step back that visibly does nothing. Tapping it again is
                     * the undo, as it is for the three toggles beside it.
                     *
                     * The selection and any half-finished pair go, though:
                     * both can be pointing at a man who is about to leave the
                     * board, and an inspector open over nobody is a panel the
                     * coach cannot dismiss by tapping the man it belongs to.
                     */
                    onClick={() => {
                      setHideOffense((v) => !v);
                      setSel(null);
                      setPending(null);
                    }}
                  >
                    Offense
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
                <button onClick={() => setPicker('print')}>Print…</button>
                <button disabled={exporting} onClick={() => void exportPlay()}>
                  Save image
                </button>
                {/*
                  * What this one play is drawn on.
                  *
                  * Pressed means white, like every other toggle in this drawer,
                  * and it says what the board would become rather than what it
                  * is. Tapping it is what cuts this play loose from Settings:
                  * until then it follows the book, and the coach who wants the
                  * whole book white has a better place to say so.
                  */}
                <button
                  aria-pressed={boardSurface === 'white'}
                  onClick={() => setSurface(boardSurface === 'white' ? 'grass' : 'white')}
                >
                  {boardSurface === 'white' ? 'White field' : 'Grass field'}
                </button>
              </div>
              {surface && (
                <p className="tool-note">
                  This play keeps its own field, whatever Settings says.{' '}
                  <button className="quiet" onClick={() => setSurface(undefined)}>
                    Follow the setting
                  </button>
                </p>
              )}
              {/* `saved > 0`, not `saved`: it starts at 0, and React renders a
                  bare falsy number rather than skipping it — which left a stray
                  "0" in the drawer until the first save of a session. */}
              {saved > 0 && Date.now() - saved < 4000 && (
                <p className="tool-note">Saved to the cloud.</p>
              )}
            </section>

            {/*
              * The app, not the play. Settings sat in the group above, between
              * Notes and Print sheet, which said it was something about this
              * play — it is the colors, the pen and the league rules, and it
              * is the same on every play in the book.
              */}
            <section className="tool-group">
              <h4>App</h4>
              <div className="tools">
                <button onClick={() => setPicker('settings')}>Settings</button>
              </div>
            </section>

            {/*
              * On its own at the bottom and wearing the one color that means
              * "this throws work away". It used to sit in the Undo group, in
              * the same gray, one button along from Step back.
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
