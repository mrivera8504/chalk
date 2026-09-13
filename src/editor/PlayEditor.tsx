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
import { VIEW, VIEW_BOX, clamp, nearestPlayer, pickRadius, snap, toYards } from '../render/geometry';
import { BlockTool, tapBlock, type Pending, type Tool } from './BlockTool';
import { LegalityBadge } from './LegalityBadge';

const settings = DEFAULT_SETTINGS;

/** Offense only. The defense goes on the board when it is asked for. */
function initialPlayers(): PlayerSlot[] {
  return applyOnLine(defaultOffense(), settings);
}

type Selection = { kind: 'player' | 'assignment'; id: string } | null;

export function PlayEditor() {
  const [players, setPlayers] = useState<PlayerSlot[]>(initialPlayers);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [tool, setTool] = useState<Tool>('select');
  const [pending, setPending] = useState<Pending | null>(null);
  const [sel, setSel] = useState<Selection>(null);
  const [showHoles, setShowHoles] = useState(true);
  const [showDefense, setShowDefense] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);

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

  function handleMove(e: React.PointerEvent) {
    const d = drag.current;
    const svg = svgRef.current;
    if (!d || !svg) return;

    const at = toYards(svg, e.clientX, e.clientY);
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
    if (!drag.current) return;
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
    const p = nearestPlayer(visible, at, pickRadius(svg));

    if (!p) {
      setSel(null);
      setPending(null);
      return;
    }

    if (tool !== 'select') {
      handleBlockTap(p);
      return;
    }

    drag.current = { id: p.id, dx: p.x - at.x, dy: p.y - at.y };
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
              pending={p.id === pending?.blockerId || p.id === pending?.targetId}
            />
          ))}
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
