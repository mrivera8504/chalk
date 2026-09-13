import { useEffect, useMemo, useRef, useState } from 'react';
import { computeHoles } from '../domain/holes';
import { applyOnLine, checkFormation, countOnLine } from '../domain/legality';
import { describeBlock, makeBlock, refreshBlocks } from '../domain/presets/blocks';
import { defaultDefense, defaultOffense } from '../domain/presets/formations';
import {
  DEFAULT_SETTINGS,
  isBlockKind,
  type Assignment,
  type PlayerSlot,
} from '../domain/types';
import { AssignmentPath } from '../render/AssignmentPath';
import { Field } from '../render/Field';
import { PlayerShape } from '../render/PlayerShape';
import {
  VIEW,
  VIEW_BOX,
  clamp,
  nearestPlayer,
  pickRadius,
  pxToYards,
  snap,
  toYards,
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

  const svgRef = useRef<SVGSVGElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  const moveCount = useRef(0);
  const aimRef = useRef<SVGGElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const hoverRef = useRef<string | null>(null);
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
    if (tool === 'select') return;
    const step = tapBlock(tool, pending, player);
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

    const next = makeBlock(tool, blocker, target, climbTo ?? undefined);
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

  function handleMove(e: React.PointerEvent) {
    const d = drag.current;
    const svg = svgRef.current;
    if (!svg) return;
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

    const at = toYards(svg, e.clientX, e.clientY);

    // Still a tap until the pen has travelled past the slop. Selecting a player
    // must never nudge him.
    if (!d.moved) {
      if (Math.hypot(at.x - d.ox, at.y - d.oy) < pxToYards(svg, DRAG_SLOP_PX)) return;
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
    e.preventDefault();
  }

  function handleUp(e: React.PointerEvent) {
    if (TRACING) trace(`${describeEvent(e)}  drag=${drag.current ? 'yes' : 'NONE'}`);
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
  function handleStageDown(e: React.PointerEvent) {
    const svg = svgRef.current;
    if (!svg) return;
    // The inspector floats inside the stage; taps on it are not board taps.
    if ((e.target as Element).closest?.('.inspector')) return;
    e.preventDefault();

    const at = toYards(svg, e.clientX, e.clientY);
    clearAim();

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
        if (TRACING) {
          trace(
            `${describeEvent(e, at)}\n            -> RESUMED ${held.label} ` +
              `(contact bounce, ${(now - bounce.at).toFixed(0)}ms gap)`,
          );
        }
        return;
      }
    }

    const radius = pickRadius(svg);
    const p = nearestPlayer(visible, at, radius);

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

  function selectAssignment(e: React.PointerEvent, id: string) {
    e.stopPropagation();
    setSel({ kind: 'assignment', id });
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

          {drawn.map((a) => (
            <AssignmentPath
              key={a.id}
              assignment={a}
              selected={sel?.kind === 'assignment' && sel.id === a.id}
              onSelect={tool === 'select' ? selectAssignment : undefined}
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

      {selectedBlock && (
        <div className="inspector">
          <div className="row">
            <strong>{describeBlock(selectedBlock, players)}</strong>
          </div>
          <div className="row">
            {selectedBlock.kind !== 'combo' && (
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
        blockCount={drawn.length}
        onClear={() => {
          setAssignments([]);
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
