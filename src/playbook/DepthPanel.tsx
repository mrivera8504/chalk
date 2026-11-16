import { useMemo, useState } from 'react';
import {
  positionsFor,
  readDepth,
  readSetCharts,
  writeDepth,
  writeSetCharts,
  type DepthChart,
  type SetCharts,
} from '../domain/depth';
import { foundationDefense, foundationOffense, readFormations } from '../domain/presets/formations';
import { byJersey, type RosterEntry } from '../domain/roster';
import { anyVariant } from '../sports';

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
 *
 * A set can have its own substitutions: pick it under *Chart for*, and a row
 * changed there is that set's alone. A row it has not changed shows the base
 * order, dimmed, and the first change copies it in.
 */
export function DepthPanel({ roster }: Props) {
  const [base, setBase] = useState<DepthChart>(readDepth);
  const [sets, setSets] = useState<SetCharts>(readSetCharts);
  /** Which set is being charted; empty is every set. */
  const [setId, setSetId] = useState('');
  const formations = useMemo(() => readFormations(), []);
  const groups = useMemo(() => {
    const out = new Map<string, typeof formations>();
    const own = formations.filter((f) => !f.builtIn);
    if (own.length) out.set('Your sets', own);
    for (const f of formations.filter((x) => x.builtIn)) {
      const label = anyVariant(f.variant).name;
      out.set(label, [...(out.get(label) ?? []), f]);
    }
    return [...out.entries()];
  }, [formations]);
  const forSet = formations.find((f) => f.id === setId);
  const own = (setId && sets[setId]) || {};

  const write = (pos: string, next: number[] | null) => {
    if (!setId) {
      const copy = { ...base };
      if (next?.length) copy[pos] = next;
      else delete copy[pos];
      setBase(copy);
      writeDepth(copy);
      return;
    }
    const mine = { ...own };
    // An empty list is said on purpose for a set: nobody at that spot here.
    if (next) mine[pos] = next;
    else delete mine[pos];
    const all = { ...sets };
    if (Object.keys(mine).length) all[setId] = mine;
    else delete all[setId];
    setSets(all);
    writeSetCharts(all);
  };

  const positions = useMemo(
    () =>
      forSet
        ? positionsFor(forSet.players.map((p) => p.label), own)
        : positionsFor([...foundationOffense(), ...foundationDefense()].map((p) => p.label), base),
    [forSet, own, base],
  );
  const name = (j: number) => roster.find((r) => r.jersey === j)?.name;

  return (
    <div className="panel depth">
      {roster.length === 0 && <p className="picker-note">Add players to the roster first.</p>}
      <label className="depth-for">
        Chart for
        <select value={setId} onChange={(e) => setSetId(e.target.value)}>
          <option value="">Every set</option>
          {/* The coach's own sets first; the built-in ones grouped by kind, or
              seventy sets across every sport is a list nobody can find one in. */}
          {groups.map(([label, list]) => (
            <optgroup key={label} label={label}>
              {list.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                  {sets[f.id] ? ' · own subs' : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      {positions.map((pos) => {
        const changed = !!setId && pos in own;
        const list = (setId ? own[pos] : undefined) ?? base[pos] ?? [];
        const free = byJersey(roster).filter((r) => !list.includes(r.jersey));
        const set = (next: number[]) => write(pos, next);
        return (
          <div key={pos} className={`depth-row${setId && !changed ? ' inherited' : ''}`}>
            <strong className="depth-pos">{pos}</strong>
            {changed && (
              <button className="quiet depth-reset" onClick={() => write(pos, null)}>
                Same as every set
              </button>
            )}
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
