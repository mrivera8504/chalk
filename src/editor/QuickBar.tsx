import { Icon } from '../ui/Icon';
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
  /** The play's steps, and the button that runs them. */
  steps: {
    count: number;
    index: number;
    playing: boolean;
    onGo: (index: number) => void;
    onAdd: () => void;
    onRemove: () => void;
    onPlay: () => void;
  };
}

/**
 * The handful of actions worth reaching without opening anything, each one
 * present only while it would do something. The container is inert and sits
 * opposite the drawer, so it never competes with the tab.
 *
 * Drawn marks rather than typed ones. ↶, ✎ and ✥ are characters, and a
 * character is drawn by whatever font the device falls back to: the pencil was
 * an emoji on one tablet and an outline on the next. Every one of these still
 * carries its `aria-label`.
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
  steps,
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
          <Icon name="undo" />
        </button>
      )}
      {canRedo && (
        <button className="quick" onClick={stepForward} aria-label="Redo">
          <Icon name="redo" />
        </button>
      )}

      {/*
        * The steps of the play, on the pencil's row. Over the board and not
        * under it: a strip below the stage would be a sibling that changes its
        * height, and every coordinate on the field would move.
        *
        * The step that is showing is pressed; tapping it again is how it is
        * taken away, which the confirm then spells out. One step and there is
        * nothing to take away, so the first chip does nothing then.
        */}
      <div className="steps">
        <button
          className={steps.playing ? 'quick play on' : 'quick play'}
          aria-pressed={steps.playing}
          aria-label={steps.playing ? 'Stop' : 'Run the play'}
          onClick={steps.onPlay}
        >
          <Icon name={steps.playing ? 'stop' : 'play'} />
        </button>
        <div className="step-chips" role="group" aria-label="Steps">
          {Array.from({ length: steps.count }, (_, i) => (
            <button
              key={i}
              className="quick step"
              aria-pressed={i === steps.index}
              aria-label={`Step ${i + 1}`}
              disabled={steps.playing}
              onClick={() => (i === steps.index ? steps.count > 1 && steps.onRemove() : steps.onGo(i))}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <button
          className="quick step"
          aria-label="Add a step"
          disabled={steps.playing}
          onClick={steps.onAdd}
        >
          <Icon name="plus" />
        </button>
      </div>

      {/* Freehand is a thing you reach for mid-play, not a mode you set out in. */}
      <button
        className={tool === 'draw' ? 'quick pencil on' : 'quick pencil'}
        aria-pressed={tool === 'draw'}
        aria-label={tool === 'draw' ? 'Stop drawing freehand' : 'Draw freehand'}
        onClick={() => handleTool(tool === 'draw' ? 'routes' : 'draw')}
      >
        <Icon name="pencil" />
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
          <Icon name="pan" />
        </button>
        <button
          className="quick"
          aria-label="Zoom in"
          disabled={zoom >= 2.5}
          onClick={() => setZoom((z) => Math.min(2.5, +(z * 1.25).toFixed(3)))}
        >
          <Icon name="plus" />
        </button>
        <button
          className="quick"
          aria-label="Zoom out"
          disabled={zoom <= 0.7}
          onClick={() => setZoom((z) => Math.max(0.7, +(z / 1.25).toFixed(3)))}
        >
          <Icon name="minus" />
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
