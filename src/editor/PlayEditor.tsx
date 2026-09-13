import { useMemo, useRef, useState } from 'react';
import { computeHoles } from '../domain/holes';
import { applyOnLine, checkFormation, countOnLine } from '../domain/legality';
import { defaultDefense, defaultOffense } from '../domain/presets/formations';
import { DEFAULT_SETTINGS, type PlayerSlot } from '../domain/types';
import { Field } from '../render/Field';
import { PlayerShape } from '../render/PlayerShape';
import { VIEW, VIEW_BOX, clamp, snap, toYards } from '../render/geometry';
import { LegalityBadge } from './LegalityBadge';

const settings = DEFAULT_SETTINGS;

/** Offense only. The defense goes on the board when it is asked for. */
function initialPlayers(): PlayerSlot[] {
  return applyOnLine(defaultOffense(), settings);
}

export function PlayEditor() {
  const [players, setPlayers] = useState<PlayerSlot[]>(initialPlayers);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showHoles, setShowHoles] = useState(true);
  const [showDefense, setShowDefense] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const visible = useMemo(
    () => (showDefense ? players : players.filter((p) => p.side === 'offense')),
    [players, showDefense],
  );

  const holes = useMemo(() => computeHoles(players, settings), [players]);
  const issues = useMemo(() => checkFormation(players, settings), [players]);
  const onLine = countOnLine(players);
  const selected = players.find((p) => p.id === selectedId) ?? null;
  const defenseExists = players.some((p) => p.side === 'defense');

  /** Backfield players sitting just behind the LOS would cover a hole number. */
  const occupied = useMemo(
    () =>
      players
        .filter((p) => p.side === 'offense' && !p.onLine && p.y > 0 && p.y < 2.6)
        .map((p) => p.x),
    [players],
  );

  function handleDefense() {
    if (!defenseExists) {
      setPlayers((prev) => applyOnLine([...prev, ...defaultDefense()], settings));
      setShowDefense(true);
      return;
    }
    setShowDefense((v) => !v);
  }

  function handleDown(e: React.PointerEvent, id: string) {
    const svg = svgRef.current;
    if (!svg) return;
    const p = players.find((q) => q.id === id);
    if (!p) return;

    const at = toYards(svg, e.clientX, e.clientY);
    drag.current = { id, dx: p.x - at.x, dy: p.y - at.y };
    setSelectedId(id);
    svg.setPointerCapture(e.pointerId);
    e.stopPropagation();
    e.preventDefault();
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
    svgRef.current?.releasePointerCapture(e.pointerId);
  }

  function toggleOnLine() {
    if (!selected) return;
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === selected.id ? { ...p, onLine: !p.onLine, onLineLocked: true } : p,
      ),
    );
  }

  function releaseLock() {
    if (!selected) return;
    setPlayers((prev) =>
      applyOnLine(
        prev.map((p) => (p.id === selected.id ? { ...p, onLineLocked: false } : p)),
        settings,
      ),
    );
  }

  function rename(label: string) {
    if (!selected) return;
    setPlayers((prev) =>
      prev.map((p) => (p.id === selected.id ? { ...p, label: label.slice(0, 3) } : p)),
    );
  }

  return (
    <div className="editor">
      <header>
        <h1>Chalk</h1>
        <LegalityBadge onLine={onLine} minOnLine={settings.minOnLine} issues={issues} />
      </header>

      <div className="stage">
        <svg
          ref={svgRef}
          viewBox={VIEW_BOX}
          preserveAspectRatio="xMidYMid meet"
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={handleUp}
          onPointerDown={() => setSelectedId(null)}
          style={{ touchAction: 'none' }}
        >
          <Field holes={holes} showHoles={showHoles} occupied={occupied} />
          {visible.map((p) => (
            <PlayerShape
              key={p.id}
              player={p}
              selected={p.id === selectedId}
              onPointerDown={handleDown}
            />
          ))}
        </svg>
      </div>

      <div className="tools">
        <button aria-pressed={showHoles} onClick={() => setShowHoles((v) => !v)}>
          Holes
        </button>
        <button aria-pressed={showDefense} onClick={handleDefense}>
          {defenseExists ? 'Defense' : 'Add defense'}
        </button>
        <button
          onClick={() => {
            setPlayers(initialPlayers());
            setSelectedId(null);
            setShowDefense(false);
          }}
        >
          Reset
        </button>
      </div>

      {selected && (
        <div className="inspector">
          <label>
            <span>Label</span>
            <input
              value={selected.label}
              onChange={(e) => rename(e.target.value)}
              maxLength={3}
              spellCheck={false}
            />
          </label>

          {selected.side === 'offense' && (
            <div className="row">
              <button aria-pressed={selected.onLine} onClick={toggleOnLine}>
                {selected.onLine ? 'On the line' : 'In the backfield'}
              </button>
              {selected.onLineLocked && (
                <button className="quiet" onClick={releaseLock}>
                  Back to auto
                </button>
              )}
            </div>
          )}

          <div className="pos">
            {selected.x.toFixed(2)} yd across, {selected.y.toFixed(2)} yd from the line
            {selected.backNumber ? ` · back ${selected.backNumber}` : ''}
          </div>
        </div>
      )}
    </div>
  );
}
