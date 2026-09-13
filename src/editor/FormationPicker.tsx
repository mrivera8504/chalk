import type { Formation } from '../domain/types';

interface Props {
  formations: Formation[];
  /** The set every new play opens in, or null while none has been chosen. */
  foundationId: string | null;
  onApply: (f: Formation) => void;
  onSave: () => void;
  onDelete: (id: string) => void;
  onSetFoundation: (id: string | null) => void;
  onClose: () => void;
}

export function FormationPicker({
  formations,
  foundationId,
  onApply,
  onSave,
  onDelete,
  onSetFoundation,
  onClose,
}: Props) {
  const foundation = formations.find((f) => f.id === foundationId);

  return (
    <div className="picker">
      <div className="picker-head">
        <strong>Formations</strong>
        <span>{foundation ? `new plays open in ${foundation.name}` : 'tap ★ to set a base'}</span>
        <button className="quiet" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="picker-group">
        <div className="picker-row">
          <button onClick={onSave}>Save this one</button>
          {formations.map((f) => (
            <span key={f.id} className="chip">
              {/* Tapping the star again clears it, which is the only way back
                  to the built-in set without deleting a formation. */}
              <button
                className={f.id === foundationId ? 'chip-star on' : 'chip-star'}
                aria-pressed={f.id === foundationId}
                aria-label={`Use ${f.name} for new plays`}
                title="Use for new plays"
                onClick={() => onSetFoundation(f.id === foundationId ? null : f.id)}
              >
                ★
              </button>
              <button onClick={() => onApply(f)}>{f.name}</button>
              {!f.builtIn && (
                <button className="chip-x" onClick={() => onDelete(f.id)} aria-label="Delete">
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      </div>
      {formations.length === 1 && (
        <p className="picker-note">
          Line the players up how you want them, then save. Star the one your
          team actually lines up in and every new play starts there.
        </p>
      )}
    </div>
  );
}
