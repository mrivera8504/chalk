import type { Formation } from '../domain/types';

interface Props {
  formations: Formation[];
  onApply: (f: Formation) => void;
  onSave: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function FormationPicker({ formations, onApply, onSave, onDelete, onClose }: Props) {
  return (
    <div className="picker">
      <div className="picker-head">
        <strong>Formations</strong>
        <button className="quiet" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="picker-group">
        <div className="picker-row">
          <button onClick={onSave}>Save this one</button>
          {formations.map((f) => (
            <span key={f.id} className="chip">
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
          Line the players up how you want them, then save. The library starts
          empty on purpose: a generic 7-man set would be guesswork.
        </p>
      )}
    </div>
  );
}
