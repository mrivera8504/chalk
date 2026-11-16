import { useMemo, useState } from 'react';
import { positionsFor, readDepth, writeDepth, type DepthChart } from '../domain/depth';
import { foundationDefense, foundationOffense } from '../domain/presets/formations';
import { byJersey, type RosterEntry } from '../domain/roster';

interface Props {
  roster: RosterEntry[];
}

/**
 * Who plays where, starter first.
 *
 * The rows are the positions of the team's own starred sets — the labels in
 * the marks the coach already drew — and then anything else that has been
 * charted. Each row is a short list of shirts, in order, with a way to move a
 * kid up and a way to take him off. Edited in place, like the roster.
 */
export function DepthPanel({ roster }: Props) {
  const [chart, setChart] = useState<DepthChart>(readDepth);
  const save = (next: DepthChart) => {
    setChart(next);
    writeDepth(next);
  };

  const positions = useMemo(
    () => positionsFor([...foundationOffense(), ...foundationDefense()].map((p) => p.label), chart),
    [chart],
  );
  const name = (j: number) => roster.find((r) => r.jersey === j)?.name;

  return (
    <div className="panel depth">
      {roster.length === 0 && <p className="picker-note">Add players to the roster first.</p>}
      {positions.map((pos) => {
        const list = chart[pos] ?? [];
        const free = byJersey(roster).filter((r) => !list.includes(r.jersey));
        const set = (next: number[]) => {
          const copy = { ...chart };
          if (next.length) copy[pos] = next;
          else delete copy[pos];
          save(copy);
        };
        return (
          <div key={pos} className="depth-row">
            <strong className="depth-pos">{pos}</strong>
            <ol>
              {list.map((j, i) => (
                <li key={j}>
                  <span className="depth-who">
                    <b>{j}</b> {name(j) ?? ''}
                  </span>
                  {i > 0 && (
                    <button
                      className="quiet"
                      aria-label={`Move ${j} up at ${pos}`}
                      onClick={() => set([...list.slice(0, i - 1), j, list[i - 1], ...list.slice(i + 1)])}
                    >
                      ↑
                    </button>
                  )}
                  <button
                    className="quiet"
                    aria-label={`Take ${j} off ${pos}`}
                    onClick={() => set(list.filter((x) => x !== j))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ol>
            {free.length > 0 && (
              <select
                aria-label={`Add a player at ${pos}`}
                value=""
                onChange={(e) => e.target.value && set([...list, Number(e.target.value)])}
              >
                <option value="">+ Add</option>
                {free.map((r) => (
                  <option key={r.id} value={r.jersey}>
                    {r.jersey} {r.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        );
      })}
    </div>
  );
}
