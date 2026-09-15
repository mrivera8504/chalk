import { COVERAGES, type CoveragePreset } from '../domain/presets/coverages';
import type { Play } from '../domain/types';

interface Props {
  /** Every play in the book, so this one can be set against an offensive one. */
  library: Play[];
  scoutPlayId?: string;
  onCoverage: (c: CoveragePreset) => void;
  onScout: (play: Play) => void;
}

/**
 * The two decisions a defensive play makes that are not about one man.
 *
 * A coverage is a call for seven players at once — who has the deep third only
 * means anything once you know who else is deep — so it cannot live in a
 * picker that opens on a single defender. And the look is a fact about the
 * whole board: which offensive play this defense is being drawn against.
 *
 * Everything either of them does is ordinary afterwards. A coverage lays down
 * plain zones and plain cover lines, each one draggable and deletable; the look
 * drops in an offense that can then be nudged. Neither leaves anything behind
 * that only this panel understands.
 */
export function DefensePanel({ library, scoutPlayId, onCoverage, onScout }: Props) {
  // Only offensive plays are a look. Setting a defense against another defense
  // is not a thing anybody does, and offering it would fill the list with the
  // plays the coach is scrolling past.
  const looks = library.filter((p) => (p.unit ?? 'offense') === 'offense');

  return (
    <div className="picker">
      {/* No header: the drawer carries the title, the subtitle and the way back. */}
      <div className="picker-group">
        <h3>Coverage</h3>
        <div className="picker-row">
          {COVERAGES.map((c) => (
            <button key={c.id} onClick={() => onCoverage(c)}>
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="picker-group">
        <h3>Set against</h3>
        <div className="picker-row">
          {looks.length ? (
            looks.map((p) => (
              <button
                key={p.id}
                aria-pressed={p.id === scoutPlayId}
                onClick={() => onScout(p)}
              >
                {p.name || p.suggestedName || 'Untitled'}
              </button>
            ))
          ) : (
            <p className="picker-note">
              Draw an offensive play and you can line this defense up against it.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
