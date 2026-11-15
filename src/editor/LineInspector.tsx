import { SWATCHES } from '../domain/colors';
import type { Assignment } from '../domain/types';

interface Props {
  /** Where the panel sits: the side and the end the selected man is not at. */
  className: string;
  line: Assignment;
  /** 'LG blocks T'. */
  title: string;
  onRetype: (id: string, kind: 'block' | 'pull') => void;
  onDelete: (id: string) => void;
  onRecolor: (id: string, color: string | undefined) => void;
}

/** What can be done to a line picked up in Move: retype it, recolor it, delete it. */
export function LineInspector({
  className,
  line: selectedBlock,
  title,
  onRetype: retype,
  onDelete: deleteAssignment,
  onRecolor: recolor,
}: Props) {
  return (
    <div
      className={className}
    >
      <div className="row">
        <strong>{title}</strong>
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
        * Color is per line, not per player, so a receiver running a route
        * and carrying the ball on a reverse can read as two different
        * things. Auto coloring is per receiver, which covers the common
        * case; this row is for the one line that needs to stand out.
        */}
      <div className="row swatches">
        {SWATCHES.map((c) => (
          <button
            key={c}
            className="swatch"
            style={{ background: c }}
            aria-label={`Color ${c}`}
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
  );
}
