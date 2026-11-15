import type { Tool } from './BlockTool';

interface Props {
  /** The edge the drawer is not on. */
  side: 'left' | 'right';
  /** What the Place button says, when something is following the pen. */
  placeLabel: string | null;
  onPlace: () => void;
  /** Present only while a line is selected. */
  onDeleteLine: (() => void) | null;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  tool: Tool;
  onTool: (tool: Tool) => void;
  panning: boolean;
  onTogglePan: () => void;
  zoom: number;
  onZoom: (next: (z: number) => number) => void;
  viewMoved: boolean;
  onResetView: () => void;
}

/**
 * The handful of actions worth reaching without opening anything, each one
 * present only while it would do something. The container is inert and sits
 * opposite the drawer, so it never competes with the tab.
 */
export function QuickBar({
  side,
  placeLabel,
  onPlace,
  onDeleteLine,
  canUndo,
  canRedo,
  onUndo: stepBack,
  onRedo: stepForward,
  tool,
  onTool: handleTool,
  panning,
  onTogglePan,
  zoom,
  onZoom: setZoom,
  viewMoved,
  onResetView: resetView,
}: Props) {
  return (
    <div className={`quick-bar ${side}`}>
      {placeLabel !== null && (
        <button className="quick place" onClick={onPlace}>
          {placeLabel}
        </button>
      )}
      {onDeleteLine && (
        <button className="quick" onClick={onDeleteLine}>
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
          onClick={onTogglePan}
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
            {zoom !== 1 ? `${Math.round(zoom * 100)}%` : 'Center'}
          </button>
        )}
      </div>
    </div>
  );
}
