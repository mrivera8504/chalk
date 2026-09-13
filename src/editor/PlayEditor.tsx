import { useEffect, useMemo, useRef, useState } from 'react';
import { computeHoles } from '../domain/holes';
import { applyOnLine, checkFormation, countOnLine } from '../domain/legality';
import { describeAssignment, makeBlock, refreshBlocks } from '../domain/presets/blocks';
import { defaultDefense } from '../domain/presets/formations';
import {
  PLAYER_R,
  isBlockKind,
  type Assignment,
  type Formation,
  type PathPoint,
  type Play,
  type PlayerSlot,
} from '../domain/types';
import { AssignmentPath } from '../render/AssignmentPath';
import { LiveInkCanvas, type InkHandle, type InkPoint } from '../render/LiveInkCanvas';
import { simplify, snapEnd, straighten, toSmoothPath, widthFromPressure } from '../render/smooth';
import { Field } from '../render/Field';
import { PlayerShape } from '../render/PlayerShape';
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
  foundationOffense,
  readFormations,
  readFoundationId,
  writeFormations,
  writeFoundationId,
} from '../domain/presets/formations';
import { UndoStack } from '../store/undo';
import { newId } from '../store/usePlaybook';
import { BlockTool, tapBlock, type Pending, type Tool } from './BlockTool';
import { Drawer } from './Drawer';
import { SettingsPanel } from './SettingsPanel';
import { NotesPanel } from './NotesPanel';
import { eraseAt } from '../domain/erase';
import { useSettings, getSettings } from '../store/settings';
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

function readDrawerOpen(): boolean {
  try {
    return localStorage.getItem(DRAWER_KEY) !== 'closed';
  } catch {
    return true;
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
function initialPlayers(): PlayerSlot[] {
  return applyOnLine(foundationOffense(), getSettings());
}

type Selection = { kind: 'player' | 'assignment'; id: string } | null;

interface DragState {
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
}

interface EditorProps {
  play: Play;
  onChange: (play: Play) => void;
  onClose: () => void;
  /** Flush to the cloud now, rather than waiting out the autosave debounce. */
  onSave: () => Promise<void>;
}

export function PlayEditor({ play, onChange, onClose, onSave }: EditorProps) {
  const settings = useSettings();
  const [players, setPlayers] = useState<PlayerSlot[]>(play.players);
  const [assignments, setAssignments] = useState<Assignment[]>(play.assignments);
  const [tool, setTool] = useState<Tool>('select');
  const [pending, setPending] = useState<Pending | null>(null);
  const [sel, setSel] = useState<Selection>(null);
  const [showHoles, setShowHoles] = useState(() => getSettings().showHoles);
  const [showDefense, setShowDefense] = useState(() => getSettings().showDefense);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<PathPoint[][]>(play.annotations);
  /** Who is getting the ball. One man at a time; tapping the star again clears it. */
  const [ballCarrierId, setBallCarrierId] = useState<string | null>(
    play.ballCarrierId ?? null,
  );
  const [name, setName] = useState(play.name);
  const [notes, setNotes] = useState(play.notes);
  const [coachingPoint, setCoachingPoint] = useState(play.coachingPoint);
  const [tags, setTags] = useState<string[]>(play.tags);
  const [erasing, setErasing] = useState(false);
  const [picker, setPicker] = useState<'formation' | 'settings' | 'notes' | null>(null);
  const [formations, setFormations] = useState<Formation[]>(readFormations);
  const [foundationId, setFoundationId] = useState<string | null>(readFoundationId);
  const [customRoutes, setCustomRoutes] = useState<CustomRoute[]>(readCustomRoutes);
  /** The team sheet, read once. Edited on the playbook screen, never here. */
  const [roster] = useState(readRoster);
  const [drawing, setDrawing] = useState(false);
  const [carrying, setCarrying] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(readDrawerOpen);
  const [exporting, setExporting] = useState(false);
  /**
   * Board magnification. The viewBox is still in yards, so screen-to-yards goes
   * on working untouched: toYards reads the SVG's own matrix, which already
   * accounts for whatever box is set here.
   */
  const [zoom, setZoom] = useState(1);
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
  /** A player lifted off the board, following the pen until it is tapped down. */
  const carry = useRef<{ id: string; dx: number; dy: number; at: number } | null>(null);
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

  /** The default box, centred and scaled. Yards throughout, as ever. */
  const viewBox = useMemo(() => {
    const w = VIEW.halfWidth * 2;
    const h = VIEW.downfield + VIEW.behind;
    // Centre of the default box: the middle of the field, a little downfield.
    const cx = 0;
    const cy = (-VIEW.downfield + VIEW.behind) / 2;
    const zw = w / zoom;
    const zh = h / zoom;
    return `${cx - zw / 2} ${cy - zh / 2} ${zw} ${zh}`;
  }, [zoom]);

  const visible = useMemo(
    () => (showDefense ? players : players.filter((p) => p.side === 'offense')),
    [players, showDefense],
  );

  /**
   * Blocks are stored as who-blocks-whom, so the geometry is rebuilt from the
   * current positions rather than cached. Dragging either man redraws the line.
   */
  const drawn = useMemo(() => refreshBlocks(assignments, players), [assignments, players]);

  // settings belongs in both: the rules are live now, and changing which way
  // the even holes run has to renumber the board without touching a player.
  const holes = useMemo(() => computeHoles(players, settings), [players, settings]);
  const issues = useMemo(() => checkFormation(players, settings), [players, settings]);
  const onLine = countOnLine(players);
  const defenseExists = players.some((p) => p.side === 'defense');

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

  const hint = useMemo(() => {
    if (tool === 'draw') {
      return drawing
        ? 'Drawing. Move the pen, then tap to finish'
        : 'Tap to start a route, move the pen, tap to finish';
    }
    if (tool === 'routes') {
      return selectedPlayer ? '' : 'Tap a man to see his routes';
    }
    if (tool === 'erase') {
      return erasing
        ? 'Rubbing out. Move the pen over the ink, tap to stop'
        : 'Tap to start rubbing out, move the pen, tap to stop';
    }
    if (tool === 'select') {
      return carrying ? `Carrying ${byId(carrying)?.label}. Tap to place` : '';
    }
    const blocker = byId(pending?.blockerId);
    if (!blocker) return 'Tap a blocker';
    if (tool === 'pull') return `Tap who ${blocker.label} pulls to`;
    if (tool === 'combo') {
      return pending?.targetId
        ? `Tap who ${blocker.label} climbs to`
        : `Tap the lineman ${blocker.label} doubles`;
    }
    return `Tap who ${blocker.label} blocks`;
  }, [tool, pending, players, drawing, carrying, erasing, sel]);

  function toggleDrawer() {
    const next = !drawerOpen;
    setDrawerOpen(next);
    writeDrawerOpen(next);
    // A picker left open behind a closed drawer reappears unasked next time.
    if (!next) setPicker(null);
  }

  useEffect(() => {
    onChange({
      ...play,
      name,
      players,
      assignments,
      annotations,
      ballCarrierId: ballCarrierId ?? undefined,
      notes,
      coachingPoint,
      tags,
    });
    // play and onChange are stable for the life of one editing session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, players, assignments, annotations, ballCarrierId, notes, coachingPoint, tags]);

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
     * Only the block tools need a front on the board. This used to fire for
     * anything that was not Select, so picking up the pen to draw a route
     * dropped a whole defense onto the field uninvited.
     */
    const needsFront =
      next !== 'select' && next !== 'routes' && next !== 'draw' && next !== 'erase';
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
    // Hiding the defense while blocking would leave nothing to tap.
    if (showDefense && tool !== 'select') setTool('select');
    setShowDefense((v) => !v);
  }

  /** Tap-tap assignment. The tool stays armed so the next man is two taps away. */
  function handleBlockTap(player: PlayerSlot) {
    if (tool === 'select' || tool === 'routes' || tool === 'draw' || tool === 'erase') return;
    const kind = tool;
    const step = tapBlock(kind, pending, player);
    if (step.type === 'none') return;
    if (step.type === 'pending') {
      setPending(step.pending);
      return;
    }

    const blocker = byId(step.blockerId);
    const target = byId(step.targetId);
    const climbTo = byId(step.climbToId);
    setPending(null);
    setSel(null);
    if (!blocker || !target) return;

    remember();
    const next = makeBlock(kind, blocker, target, climbTo ?? undefined);
    setAssignments((prev) => [
      // One block per man. Re-tapping a blocker corrects him instead of stacking.
      ...prev.filter((a) => !(a.playerId === blocker.id && isBlockKind(a.kind))),
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
    undo.current.push({ players, assignments, annotations, ballCarrierId });
    syncUndo();
  }

  function restore(snap: Snapshot) {
    setPlayers(snap.players);
    setAssignments(snap.assignments);
    setAnnotations(snap.annotations);
    setBallCarrierId(snap.ballCarrierId);
    setSel(null);
    setPending(null);
    syncUndo();
  }

  function stepBack() {
    dropCarried('undo');
    const prev = undo.current.undo({ players, assignments, annotations, ballCarrierId });
    if (prev) restore(prev);
    else syncUndo();
  }

  function stepForward() {
    dropCarried('redo');
    const next = undo.current.redo({ players, assignments, annotations, ballCarrierId });
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
   * Keep a drawn route as a concept.
   *
   * Stored relative to the man who ran it, so it can be given to anybody
   * afterwards — the same rule every built-in preset follows.
   */
  function saveDrawnRoute(player: PlayerSlot) {
    const current = routeOf(player.id);
    if (!current || current.path.length < 2) return;
    const label = prompt('Name this route');
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
    setSel(null);
  }

  function applyFormation(f: Formation) {
    remember();
    setPlayers((prev) => [
      ...applyOnLine(structuredClone(f.players), settings),
      ...prev.filter((p) => p.side === 'defense'),
    ]);
    // Assignments, and the star, name players that no longer exist.
    setAssignments([]);
    setBallCarrierId(null);
    setSel(null);
    setPicker(null);
  }

  function saveFormation() {
    const label = prompt('Name this formation');
    if (!label?.trim()) return;
    const next: Formation = {
      id: newId('f'),
      name: label.trim(),
      side: 'offense',
      players: structuredClone(players.filter((p) => p.side === 'offense')),
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
    writeFoundationId(id);
  }

  function dropCarried(reason: string) {
    const held = carry.current;
    carry.current = null;
    tapGuard.current = performance.now() + CHATTER_MS;
    setCarrying(null);
    if (TRACING && held) trace(`            -> placed ${byId(held.id)?.label} (${reason})`);
  }

  function moveCarried(svg: SVGSVGElement, at: Yards) {
    const c = carry.current;
    if (!c) return;
    applyDrag(svg, { id: c.id, dx: c.dx, dy: c.dy, ox: 0, oy: 0, moved: true }, at);
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
  function applyDrag(svg: SVGSVGElement, d: DragState, at: Yards): boolean {
    if (!d.moved) {
      if (Math.hypot(at.x - d.ox, at.y - d.oy) < pxToYards(svg, DRAG_SLOP_PX)) return false;
      d.moved = true;
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
     */
    const onOffense = byId(d.id)?.side === 'offense';
    const step = settings.snapStepYards;
    const magnet = onOffense ? settings.losMagnetYards : 0;
    const x = clamp(snap(at.x + d.dx, step), -VIEW.halfWidth + 1, VIEW.halfWidth - 1);
    const y = clamp(
      snapDepth(at.y + d.dy, magnet, step),
      -VIEW.downfield + 1,
      VIEW.behind - 1,
    );

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
        moveCarried(svg, toYards(svg, e.clientX, e.clientY));
        return;
      }
      // Touch has no hover, so there is nothing to preview for a finger.
      if (e.pointerType !== 'touch') showAim(svg, e);
      // A move with no drag underway is either hover or a lost grip. Both are
      // worth seeing, but only occasionally, or the log is nothing else.
      if (TRACING && e.pointerType === 'pen' && moveCount.current++ % 25 === 0) {
        trace(`${describeEvent(e)}  [no drag underway]`);
      }
      return;
    }

    applyDrag(svg, d, toYards(svg, e.clientX, e.clientY));
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
    if (!drag.current.moved && tool === 'select') {
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
    setDrawing(false);
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
      setDrawing(true);
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
      const held = byId(bounce.id);
      if (held) {
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
          id: bounce.id,
          dx: bounce.dx,
          dy: bounce.dy,
          ox: bounce.ox,
          oy: bounce.oy,
          moved: bounce.moved,
        };
        setSel({ kind: 'player', id: held.id });
        try {
          stageRef.current?.setPointerCapture(e.pointerId);
        } catch {
          /* not fatal */
        }
        const moved = applyDrag(svg, drag.current, at);
        if (TRACING) {
          trace(
            `${describeEvent(e, at)}\n            -> RESUMED ${held.label} ` +
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
    const lines = tool === 'select' ? drawn : [];
    const hit = pickAt(visible, lines, at, radius, PLAYER_R);
    const p = hit?.kind === 'player' ? byId(hit.id) : null;

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
      setSel(p ? { kind: 'player', id: p.id } : null);
      setPending(null);
      tapGuard.current = performance.now() + CHATTER_MS;
      return;
    }

    if (!p) {
      setSel(null);
      setPending(null);
      return;
    }

    if (tool !== 'select') {
      handleBlockTap(p);
      return;
    }

    drag.current = { id: p.id, dx: p.x - at.x, dy: p.y - at.y, ox: at.x, oy: at.y, moved: false };
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
      setAssignments((prev) => prev.filter((a) => a.id !== line.id));
      setSel(null);
    }
  }

  function deleteAssignment(id: string) {
    remember();
    setAssignments((prev) => prev.filter((a) => a.id !== id));
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
          await singlePlayPdf(current, { showHoles }, roster),
          `${slug}-${stamp()}.pdf`,
          'application/pdf',
        );
      } else {
        // 2000px across is a little over 300 DPI at the width this prints.
        const bytes = await playToPng(current, 2000, { showHoles, showDefense });
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

  function reset() {
    dropCarried('reset');
    remember();
    setPlayers(initialPlayers());
    setAssignments([]);
    setAnnotations([]);
    setBallCarrierId(null);
    setSel(null);
    setPending(null);
    setTool('select');
    setShowDefense(false);
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
        <LegalityBadge onLine={onLine} minOnLine={settings.minOnLine} issues={issues} />
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
          <Field holes={holes} showHoles={showHoles} occupied={occupied} />

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
        <div className="inspector">
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
        <div className="inspector">
          <RoutePicker
            player={selectedPlayer}
            custom={customRoutes.map(toPreset)}
            onPick={applyRoute}
            onDeleteCustom={deleteCustomRoute}
            onSaveDrawn={
              routeOf(selectedPlayer.id) ? () => saveDrawnRoute(selectedPlayer) : null
            }
            onClear={routeOf(selectedPlayer.id) ? () => clearRoute(selectedPlayer.id) : null}
            onFlip={routeOf(selectedPlayer.id) ? () => flipRoute(selectedPlayer) : null}
            hasBall={ballCarrierId === selectedPlayer.id}
            onGiveBall={() => giveBall(selectedPlayer.id)}
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
        * The one line that guides the tap-tap grammar, floating clear of the
        * panel so it survives the drawer being shut. Inert, and only there when
        * there is something to say.
        */}
      {hint && <div className="hint-pill">{hint}</div>}

      {/*
        * The handful of actions worth reaching without opening anything, each
        * one present only while it would do something. The container is inert
        * and sits opposite the drawer, so it never competes with the tab.
        */}
      <div className={`quick-bar ${settings.drawerSide === 'right' ? 'left' : 'right'}`}>
        {carrying && (
          <button className="quick place" onClick={() => dropCarried('quick bar')}>
            Place {byId(carrying)?.label}
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
          {zoom !== 1 && (
            <button className="quick" aria-label="Actual size" onClick={() => setZoom(1)}>
              {Math.round(zoom * 100)}%
            </button>
          )}
        </div>
      </div>

      <Drawer open={drawerOpen} onToggle={toggleDrawer} side={settings.drawerSide}>
        <div className="drawer-head">
          <strong>
            {picker === 'settings' ? 'Settings' : picker === 'notes' ? 'Notes' : 'Tools'}
          </strong>
          <button className="quiet" onClick={toggleDrawer}>
            Hide
          </button>
        </div>

        {picker === 'settings' ? (
          <SettingsPanel settings={settings} onClose={() => setPicker(null)} />
        ) : picker === 'notes' ? (
          <NotesPanel
            coachingPoint={coachingPoint}
            notes={notes}
            tags={tags}
            onCoachingPoint={setCoachingPoint}
            onNotes={setNotes}
            onTags={setTags}
            onClose={() => setPicker(null)}
          />
        ) : (
          <>
            {picker === 'formation' && (
              <FormationPicker
                formations={formations}
                foundationId={foundationId}
                onApply={applyFormation}
                onSave={saveFormation}
                onDelete={deleteFormation}
                onSetFoundation={setFoundation}
                onClose={() => setPicker(null)}
              />
            )}

            {/*
              * Grouped by what each button does to the play rather than listed
              * flat. Sixteen unlabelled pills all looked equally important and
              * none of them said what they were for.
              */}
            <section className="tool-group">
              <h4>Mode</h4>
              <BlockTool tool={tool} onTool={handleTool} />
              <p className="tool-note">
                {tool === 'select'
                  ? 'Tap a man to pick him up, tap again to set him down.'
                  : tool === 'draw'
                    ? 'Tap to start, move the pen, tap to finish. It does not have to stay down.'
                    : tool === 'erase'
                      ? 'Tap to start, sweep over the ink, tap to stop. Freehand rubs out in parts; a route or block goes whole.'
                      : tool === 'routes'
                        ? 'Tap a man to see what he can run, which way he runs it, and whether he gets the ball.'
                        : 'Tap the blocker, then tap who he goes to.'}
              </p>
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
                <div className="tools">
                  <button
                    aria-pressed={ballCarrierId === selectedPlayer.id}
                    onClick={() => giveBall(selectedPlayer.id)}
                  >
                    ★ Gets the ball
                  </button>
                </div>
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
                  Formation
                </button>
                <button onClick={mirror}>Flip sides</button>
                <button
                  className="quiet"
                  disabled={drawn.length + annotations.length === 0}
                  onClick={() => {
                    remember();
                    setAssignments([]);
                    setAnnotations([]);
                    setSel(null);
                    setPending(null);
                  }}
                >
                  Clear {drawn.length + annotations.length || ''}
                </button>
              </div>
              <p className="tool-note">
                Routes mode: tap a man on the board and pick what he runs.
              </p>
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
                <button className="quiet" onClick={reset}>
                  Start over
                </button>
              </div>
            </section>

            <section className="tool-group">
              <h4>Show</h4>
              <div className="tools">
                <button aria-pressed={showHoles} onClick={() => setShowHoles((v) => !v)}>
                  Hole numbers
                </button>
                <button aria-pressed={showDefense} onClick={handleDefense}>
                  {defenseExists ? 'Defense' : 'Add defense'}
                </button>
              </div>
            </section>

            <section className="tool-group">
              <h4>This play</h4>
              <div className="tools">
                <button onClick={() => void saveNow()} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => setPicker('notes')}
                >
                  Notes{tags.length ? ` · ${tags.length}` : ''}
                </button>
                <button
                  onClick={() => setPicker('settings')}
                >
                  Settings
                </button>
                <button disabled={exporting} onClick={() => void exportPlay('pdf')}>
                  {exporting ? 'Working…' : 'Print sheet'}
                </button>
                <button disabled={exporting} onClick={() => void exportPlay('png')}>
                  Save image
                </button>
              </div>
              <p className="tool-note">
                {saved && Date.now() - saved < 4000
                  ? 'Saved to the cloud.'
                  : 'Every change is already kept on this phone. Save pushes it to the cloud now.'}
              </p>
            </section>
          </>
        )}
      </Drawer>
      </div>

      {TRACING && <TracePanel />}
    </div>
  );
}
