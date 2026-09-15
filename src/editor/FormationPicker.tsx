import type { Formation, Side } from '../domain/types';

interface Props {
  formations: Formation[];
  /**
   * The unit this play is about. Both sides' sets are offered whichever it is —
   * an offensive play wants a front to block against, and a defensive one wants
   * a look to line up on — but only this unit's can be starred, because the
   * star means "every new play of mine opens here" and there is one per side.
   */
  unit: Side;
  /** The set every new play opens in, or null while none has been chosen. */
  foundationId: string | null;
  onApply: (f: Formation) => void;
  onSave: () => void;
  onDelete: (id: string) => void;
  onSetFoundation: (id: string | null) => void;
}

export function FormationPicker({
  formations,
  unit,
  foundationId,
  onApply,
  onSave,
  onDelete,
  onSetFoundation,
}: Props) {
  const mine = formations.filter((f) => f.side === unit);
  const theirs = formations.filter((f) => f.side !== unit);

  const chip = (f: Formation, starrable: boolean) => (
    <span key={f.id} className="chip">
      {/* Tapping the star again clears it, which is the only way back
          to the built-in set without deleting a formation. */}
      {starrable && (
        <button
          className={f.id === foundationId ? 'chip-star on' : 'chip-star'}
          aria-pressed={f.id === foundationId}
          aria-label={`Use ${f.name} for new plays`}
          title="Use for new plays"
          onClick={() => onSetFoundation(f.id === foundationId ? null : f.id)}
        >
          ★
        </button>
      )}
      <button onClick={() => onApply(f)}>{f.name}</button>
      {!f.builtIn && (
        <button className="chip-x" onClick={() => onDelete(f.id)} aria-label="Delete">
          ×
        </button>
      )}
    </span>
  );

  return (
    <div className="picker">
      {/* No header: the drawer carries the title, the subtitle and the way back. */}
      <div className="picker-group">
        <div className="picker-row">
          <button onClick={onSave}>Save this one</button>
          {mine.map((f) => chip(f, true))}
        </div>
      </div>

      {/*
        * The other side of the ball, applied and never starred. Swapping the
        * look a defense is set against, or the front a play is blocked against,
        * replaces only that side: the half of the board you are working on
        * stays exactly as you drew it.
        */}
      {theirs.length > 0 && (
        <div className="picker-group">
          <h3>{unit === 'defense' ? 'The look' : 'The front'}</h3>
          <div className="picker-row">{theirs.map((f) => chip(f, false))}</div>
        </div>
      )}

    </div>
  );
}
