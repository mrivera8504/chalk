import { useEffect, useMemo, useRef, useState } from 'react';
import { computeHoles } from '../domain/holes';
import { applyOnLine, checkFormation, countOnLine } from '../domain/legality';
import { describeAssignment, makeBlock, refreshBlocks } from '../domain/presets/blocks';
import { defaultDefense, defaultOffense } from '../domain/presets/formations';
import {
  DEFAULT_SETTINGS,
  isBlockKind,
  type Assignment,
  type PathPoint,
  type PlayerSlot,
} from '../domain/types';
import { AssignmentPath } from '../render/AssignmentPath';
import { LiveInkCanvas, type InkHandle, type InkPoint } from '../render/LiveInkCanvas';
import { simplify, toSmoothPath } from '../render/smooth';
import { Field } from '../render/Field';
import { PlayerShape } from '../render/PlayerShape';
import {
  VIEW,
  VIEW_BOX,
  clamp,
  distanceToPath,
  nearestAssignment,
  nearestPlayer,
  pickRadius,
  pxToYards,
  snap,
  toYards,
  toPathD,
  type Yards,
} from '../render/geometry';
import { BlockTool, tapBlock, type Pending, type Tool } from './BlockTool';
import { TracePanel } from './TracePanel';
import { TRACING, describeEvent, trace } from './trace';
import { LegalityBadge } from './LegalityBadge';

const settings = DEFAULT_SETTINGS;

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

let inkCounter = 0;
const inkId = () => `k${Date.now().toString(36)}${(inkCounter++).toString(36)}`;

/** Offense only. The defense goes on the board when it is asked for. */
function initialPlayers(): PlayerSlot[] {
  return applyOnLine(defaultOffense(), settings);
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

export function PlayEditor() {
  const [players, setPlayers] = useState<PlayerSlot[]>(initialPlayers);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [tool, setTool] = useState<Tool>('select');
  const [pending, setPending] = useState<Pending | null>(null);
  const [sel, setSel] = useState<Selection>(null);
  const [showHoles, setShowHoles] = useState(true);
  const [showDefense, setShowDefense] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<PathPoint[][]>([]);

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
  /** Where a drag was when contact broke, so a bounce can pick it back up. */
  const lastDrop = useRef<(DragState & { at: number; x: number; y: number }) | null>(null);

  const visible = useMemo(
    () => (showDefense ? players : players.filter((p) => p.side === 'offense')),
    [players, showDefense],
  );

  /**
   * Blocks are stored as who-blocks-whom, so the geometry is rebuilt from the
   * current positions rather than cached. Dragging either man redraws the line.
   */
  const drawn = useMemo(() => refreshBlocks(assignments, players), [assignments, players]);

  const holes = useMemo(() => computeHoles(players, settings), [players]);
  const issues = useMemo(() => checkFormation(players, settings), [players]);
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
    if (tool === 'select') return '';
    const blocker = byId(pending?.blockerId);
    if (!blocker) return 'Tap a blocker';
    if (tool === 'pull') return `Tap who ${blocker.label} pulls to`;
    if (tool === 'combo') {
      return pending?.targetId
        ? `Tap who ${blocker.label} climbs to`
        : `Tap the lineman ${blocker.label} doubles`;
    }
    return `Tap who ${blocker.label} blocks`;
  }, [tool, pending, players]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el || tool !== 'draw' || !('onpointerrawupdate' in window)) {
      rawBound.current = false;
      return;
    }
    const onRaw = (ev: Event) => {
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
    setPending(null);
    setSel(null);
    setTool(next);
    // There is nobody to block without a front on the board.
    if (next !== 'select' && !defenseExists) {
      setPlayers((prev) => applyOnLine([...prev, ...defaultDefense()], settings));
    }
    if (next !== 'select') setShowDefense(true);
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
    if (tool === 'select' || tool === 'draw') return;
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

    const x = clamp(snap(at.x + d.dx), -VIEW.halfWidth + 1, VIEW.halfWidth - 1);
    const y = clamp(snap(at.y + d.dy), -VIEW.downfield + 1, VIEW.behind - 1);

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
    if (tool === 'draw') {
      // Raw updates, where supported, carry one sample per event and are bound
      // natively below. Handling both would double every point.
      if (stroke.current && !rawBound.current) extendStroke(e);
      return;
    }

    if (!d) {
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

    if (tool === 'draw' && stroke.current) {
      if (commitTimer.current) window.clearTimeout(commitTimer.current);
      commitTimer.current = window.setTimeout(commitStroke, CHATTER_MS);
      return;
    }
    if (!drag.current) return;

    // Provisional, not final: the pen may simply have bounced. handleStageDown
    // decides, by how soon and how near the next contact lands.
    const svg = svgRef.current;
    const at = svg ? toYards(svg, e.clientX, e.clientY) : null;
    lastDrop.current = at
      ? { ...drag.current, at: performance.now(), x: at.x, y: at.y }
      : null;
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
  /** Palm rejection: ignore touch that lands while the pen is in play. */
  function accepts(e: React.PointerEvent | PointerEvent): boolean {
    if (e.pointerType === 'pen') {
      lastPenAt.current = performance.now();
      return true;
    }
    if (e.pointerType === 'touch') return performance.now() - lastPenAt.current > 800;
    return true;
  }

  function extendStroke(e: React.PointerEvent | PointerEvent) {
    const pts = stroke.current;
    if (!pts || !accepts(e)) return;

    // One event per sample with raw updates; with plain moves the samples are
    // batched, so unpack them or the stroke corners off at speed.
    const native = 'getCoalescedEvents' in e ? (e as PointerEvent) : null;
    const batch = native?.getCoalescedEvents?.() ?? null;
    if (batch && batch.length > 1) for (const c of batch) pts.push({ x: c.clientX, y: c.clientY });
    else pts.push({ x: e.clientX, y: e.clientY });

    const ahead = (e as PointerEvent).getPredictedEvents?.() ?? [];
    ink.current?.draw(
      pts,
      ahead.map((p) => ({ x: p.clientX, y: p.clientY })),
    );
  }

  /**
   * Turn the raw samples into an assignment. Simplified first, because a pen
   * lays down hundreds of points that describe a straight line, then smoothed
   * so the retained corners read as the curve the hand actually drew.
   */
  function commitStroke() {
    const pts = stroke.current;
    const owner = strokeOwner.current;
    stroke.current = null;
    strokeOwner.current = null;
    commitTimer.current = null;
    ink.current?.clear();

    const svg = svgRef.current;
    if (!pts || pts.length < 2 || !svg) return;

    const path = toSmoothPath(simplify(pts.map((q) => toYards(svg, q.x, q.y)), INK_TOLERANCE));
    if (path.length < 2) return;

    if (TRACING) trace(`stroke committed: ${pts.length} samples -> ${path.length} points`);

    if (owner) {
      // One drawn route per player; drawing again replaces it.
      setAssignments((prev) => [
        ...prev.filter((a) => !(a.playerId === owner && a.kind === 'route')),
        { id: inkId(), playerId: owner, kind: 'route', path },
      ]);
    } else {
      setAnnotations((prev) => [...prev, path]);
    }
  }

  function handleStageDown(e: React.PointerEvent) {
    const svg = svgRef.current;
    if (!svg) return;
    // The inspector floats inside the stage; taps on it are not board taps.
    if ((e.target as Element).closest?.('.inspector')) return;
    e.preventDefault();

    const at = toYards(svg, e.clientX, e.clientY);
    clearAim();

    if (tool === 'draw') {
      if (!accepts(e)) return;

      /*
       * A stroke does not end at pointerup, it ends when the pen stays off.
       * This device breaks contact constantly mid-gesture, so a lift is held
       * provisionally: land again soon enough and near enough and the same
       * stroke carries on, rather than being chopped into fragments.
       */
      const resuming = commitTimer.current !== null && stroke.current !== null;
      if (resuming) {
        window.clearTimeout(commitTimer.current!);
        commitTimer.current = null;
        if (TRACING) trace(`${describeEvent(e, at)}\n            -> stroke continues after a break`);
      } else {
        stroke.current = [];
        strokeOwner.current = nearestPlayer(visible, at, pickRadius(svg))?.id ?? null;
        if (TRACING) {
          trace(
            `${describeEvent(e, at)}\n            -> stroke started` +
              `${strokeOwner.current ? ` for ${byId(strokeOwner.current)?.label}` : ' (annotation)'}`,
          );
        }
      }

      stroke.current!.push({ x: e.clientX, y: e.clientY });
      try {
        stageRef.current?.setPointerCapture(e.pointerId);
      } catch {
        /* not fatal */
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
    const p = nearestPlayer(visible, at, radius);

    /*
     * A block line runs between two men who are often less than two yards
     * apart, so it lies inside both their pick radii. Checking players first
     * would make the line unselectable; whichever is genuinely nearer wins.
     * Tapping a mark still gets the mark, because the line stops at its edge.
     */
    const line = tool === 'select' ? nearestAssignment(drawn, at, radius) : null;
    if (line) {
      const toLine = distanceToPath(line.path, at);
      const toPlayer = p ? Math.hypot(p.x - at.x, p.y - at.y) : Infinity;
      if (toLine < toPlayer) {
        if (TRACING) {
          trace(`${describeEvent(e, at)}\n            -> picked a block line at ${toLine.toFixed(2)}yd`);
        }
        setPending(null);
        setSel({ kind: 'assignment', id: line.id });
        return;
      }
    }

    if (TRACING) {
      const d = p ? Math.hypot(p.x - at.x, p.y - at.y) : NaN;
      trace(
        `${describeEvent(e, at)}\n            -> ${
          p ? `picked ${p.label} at ${d.toFixed(2)}yd` : 'NOTHING'
        } (radius ${radius.toFixed(2)}yd, tool ${tool})`,
      );
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
    setSel({ kind: 'player', id: p.id });
    // Capture can throw if the pointer is already gone. The drag survives
    // without it, because every move bubbles back to this same element.
    try {
      stageRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* not fatal */
    }
  }

  function deleteAssignment(id: string) {
    setAssignments((prev) => prev.filter((a) => a.id !== id));
    setSel(null);
  }

  /** A base block and a pull differ only in the path, so the swap is free. */
  function retype(id: string, kind: 'block' | 'pull') {
    setAssignments((prev) => prev.map((a) => (a.id === id ? { ...a, kind } : a)));
  }

  function toggleOnLine() {
    if (!selectedPlayer) return;
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === selectedPlayer.id ? { ...p, onLine: !p.onLine, onLineLocked: true } : p,
      ),
    );
  }

  function releaseLock() {
    if (!selectedPlayer) return;
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

  function reset() {
    setPlayers(initialPlayers());
    setAssignments([]);
    setAnnotations([]);
    setSel(null);
    setPending(null);
    setTool('select');
    setShowDefense(false);
  }

  return (
    <div className="editor">
      <header>
        <h1>Chalk</h1>
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
        <svg ref={svgRef} viewBox={VIEW_BOX} preserveAspectRatio="xMidYMid meet">
          <Field holes={holes} showHoles={showHoles} occupied={occupied} />

          {annotations.map((path, i) => (
            <path
              key={`ann${i}`}
              d={toPathD(path)}
              fill="none"
              stroke="var(--chalk)"
              strokeWidth={0.14}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.75}
            />
          ))}

          {drawn.map((a) => (
            <AssignmentPath
              key={a.id}
              assignment={a}
              selected={sel?.kind === 'assignment' && sel.id === a.id}
            />
          ))}

          {visible.map((p) => (
            <PlayerShape
              key={p.id}
              player={p}
              selected={sel?.kind === 'player' && sel.id === p.id}
              hovered={p.id === hoverId}
              pending={p.id === pending?.blockerId || p.id === pending?.targetId}
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
        </div>
      )}

      {selectedPlayer && (
        <div className="inspector">
          <label>
            <span>Label</span>
            <input
              value={selectedPlayer.label}
              onChange={(e) => rename(e.target.value)}
              maxLength={3}
              spellCheck={false}
            />
          </label>

          {selectedPlayer.side === 'offense' && (
            <div className="row">
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

          <div className="pos">
            {selectedPlayer.x.toFixed(2)} yd across, {selectedPlayer.y.toFixed(2)} yd from the
            line
            {selectedPlayer.backNumber ? ` · back ${selectedPlayer.backNumber}` : ''}
          </div>
        </div>
      )}
      </div>

      {TRACING && <TracePanel />}

      <BlockTool
        tool={tool}
        onTool={handleTool}
        hint={hint}
        blockCount={drawn.length + annotations.length}
        onClear={() => {
          setAssignments([]);
          setAnnotations([]);
          setSel(null);
          setPending(null);
        }}
      />

      <div className="tools">
        <button aria-pressed={showHoles} onClick={() => setShowHoles((v) => !v)}>
          Holes
        </button>
        <button aria-pressed={showDefense} onClick={handleDefense}>
          {defenseExists ? 'Defense' : 'Add defense'}
        </button>
        <button onClick={reset}>Reset</button>
      </div>

    </div>
  );
}
