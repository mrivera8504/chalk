import { useState } from 'react';
import {
  byJersey,
  jerseyTaken,
  newEntry,
  nextJersey,
  writeRoster,
  type RosterEntry,
} from '../domain/roster';

interface Props {
  roster: RosterEntry[];
  onChange: (roster: RosterEntry[]) => void;
  onClose: () => void;
}

/**
 * The team sheet.
 *
 * Lives on the playbook screen rather than in the editor drawer, because a
 * roster belongs to the team and not to any one play — the same reason the
 * formations and the saved routes sit where they do. The editor only ever reads
 * it, to put a name against a slot.
 *
 * Edited in place, with no save button: a roster is a dozen rows typed once in
 * August and corrected twice, and a form that has to be submitted is a form
 * somebody abandons halfway with the changes lost.
 */
export function RosterPanel({ roster, onChange, onClose }: Props) {
  const [clash, setClash] = useState<string | null>(null);

  function update(id: string, patch: Partial<RosterEntry>) {
    const next = roster.map((e) => (e.id === id ? { ...e, ...patch } : e));
    onChange(next);
    writeRoster(next);
  }

  /**
   * A shirt number is the link to a player slot, so two kids in one shirt would
   * make the board ambiguous. Refused rather than silently reassigned, and said
   * out loud, because the typing that caused it is still on screen.
   */
  function setJersey(entry: RosterEntry, raw: string) {
    const n = Number(raw);
    if (!Number.isFinite(n) || raw.trim() === '') return;
    const jersey = Math.trunc(n);
    if (jerseyTaken(roster, jersey, entry.id)) {
      setClash(`${jersey} is already taken.`);
      return;
    }
    setClash(null);
    update(entry.id, { jersey });
  }

  function add() {
    const next = [...roster, newEntry(nextJersey(roster))];
    onChange(next);
    writeRoster(next);
  }

  function remove(entry: RosterEntry) {
    const who = entry.name.trim() || `number ${entry.jersey}`;
    if (!confirm(`Take ${who} off the roster?`)) return;
    const next = roster.filter((e) => e.id !== entry.id);
    onChange(next);
    writeRoster(next);
  }

  const sorted = byJersey(roster);

  return (
    <div className="picker roster-panel">
      <div className="picker-head">
        <strong>Roster</strong>
        <span>
          {roster.length} {roster.length === 1 ? 'player' : 'players'}
        </span>
        <button className="quiet" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="picker-group">
        {sorted.map((entry) => (
          <div key={entry.id} className="roster-row">
            <input
              className="roster-jersey"
              type="number"
              min={0}
              max={99}
              defaultValue={entry.jersey}
              aria-label="Shirt number"
              onBlur={(e) => setJersey(entry, e.target.value)}
            />
            <input
              className="roster-name"
              value={entry.name}
              placeholder="Name"
              spellCheck={false}
              aria-label={`Name for number ${entry.jersey}`}
              onChange={(e) => update(entry.id, { name: e.target.value })}
            />
            <input
              className="roster-positions"
              value={entry.positions.join(' ')}
              placeholder="QB RB"
              spellCheck={false}
              aria-label={`Positions for number ${entry.jersey}`}
              onChange={(e) =>
                update(entry.id, {
                  positions: e.target.value.split(/[\s,]+/).filter(Boolean),
                })
              }
            />
            <button
              className="quiet"
              aria-label={`Remove number ${entry.jersey}`}
              onClick={() => remove(entry)}
            >
              ×
            </button>
          </div>
        ))}

        {!roster.length && (
          <p className="picker-note">
            Nobody on the team sheet yet. Add a kid and you can put his number on
            a slot in any play.
          </p>
        )}
      </div>

      {clash && <p className="picker-note bad">{clash}</p>}

      <div className="picker-group">
        <div className="picker-row">
          <button onClick={add}>Add a player</button>
        </div>
        <p className="picker-note">
          The shirt number is what links a kid to a slot on the board, so it has
          to be his alone. Positions are a note to you; nothing checks them.
        </p>
      </div>
    </div>
  );
}
