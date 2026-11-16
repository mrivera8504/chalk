import { useState } from 'react';
import {
  newPractice,
  practiceId,
  readPractices,
  schedule,
  totalMinutes,
  writePractices,
  type Practice,
  type PracticeBlock,
} from '../domain/practice';
import type { Play } from '../domain/types';
import { download, slug, stamp } from '../export/render';
import { askConfirm, askText } from '../ui/dialog';
import { toast } from '../ui/toast';

interface Props {
  plays: Play[];
}

/**
 * Practices: a start time and a run of timed blocks, each with the drills and
 * plays it works on, and a sheet to print.
 */
export function PracticePanel({ plays }: Props) {
  const [all, setAll] = useState<Practice[]>(readPractices);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = (next: Practice[]) => {
    setAll(next);
    writePractices(next);
  };
  const update = (p: Practice) =>
    save(all.map((x) => (x.id === p.id ? { ...p, updatedAt: Date.now() } : x)));

  async function add() {
    const name = await askText('New practice', { placeholder: 'Tuesday', label: 'Name', confirmLabel: 'Add' });
    if (!name) return;
    const p = newPractice(name);
    save([p, ...all]);
    setOpen(p.id);
  }

  async function print(p: Practice) {
    if (busy) return;
    setBusy(true);
    try {
      const { practicePdf } = await import('../export/pdf');
      const bytes = await practicePdf(p, plays);
      download(bytes, `${slug(p.name, 'practice')}-${stamp()}.pdf`, 'application/pdf');
    } catch {
      toast('The practice sheet did not finish.');
    } finally {
      setBusy(false);
    }
  }

  const current = all.find((p) => p.id === open);
  if (current) {
    return (
      <PracticeEditor
        practice={current}
        plays={plays}
        busy={busy}
        onChange={update}
        onPrint={() => void print(current)}
        onClose={() => setOpen(null)}
        onDelete={async () => {
          const ok = await askConfirm(`Delete ${current.name}?`, { confirmLabel: 'Delete', danger: true });
          if (!ok) return;
          save(all.filter((p) => p.id !== current.id));
          setOpen(null);
        }}
      />
    );
  }

  return (
    <div className="panel practices">
      <div className="picker-row">
        <button className="primary" onClick={() => void add()}>
          New practice
        </button>
      </div>
      {all.length === 0 && <p className="picker-note">No practices yet.</p>}
      {all.map((p) => (
        <button key={p.id} className="practice-item" onClick={() => setOpen(p.id)}>
          <strong>{p.name}</strong>
          <span>
            {schedule(p)[0]?.start ?? ''} · {totalMinutes(p)} min · {p.blocks.length} blocks
          </span>
        </button>
      ))}
    </div>
  );
}

function PracticeEditor({
  practice: p,
  plays,
  busy,
  onChange,
  onPrint,
  onClose,
  onDelete,
}: {
  practice: Practice;
  plays: Play[];
  busy: boolean;
  onChange: (p: Practice) => void;
  onPrint: () => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const times = schedule(p);
  const setBlock = (id: string, next: Partial<PracticeBlock>) =>
    onChange({ ...p, blocks: p.blocks.map((b) => (b.id === id ? { ...b, ...next } : b)) });
  const move = (i: number, by: number) => {
    const blocks = [...p.blocks];
    const [b] = blocks.splice(i, 1);
    blocks.splice(Math.max(0, Math.min(blocks.length, i + by)), 0, b);
    onChange({ ...p, blocks });
  };
  const title = (play: Play) => play.name || play.suggestedName || 'Untitled';
  // Drills first in the picker: a practice is mostly made of them.
  const choices = [...plays].sort((a, b) => Number(Boolean(b.drill)) - Number(Boolean(a.drill)));

  return (
    <div className="panel practice-edit">
      <div className="picker-row">
        <button className="quiet" onClick={onClose}>
          ← Practices
        </button>
        <button className="primary" disabled={busy} onClick={onPrint}>
          {busy ? 'Drawing…' : 'Print'}
        </button>
      </div>
      <div className="setting practice-head">
        <input
          className="notes-line"
          value={p.name}
          aria-label="Practice name"
          onChange={(e) => onChange({ ...p, name: e.target.value })}
        />
        <input
          type="time"
          value={p.startsAt}
          aria-label="Starts at"
          onChange={(e) => onChange({ ...p, startsAt: e.target.value || p.startsAt })}
        />
      </div>
      <p className="picker-note">
        {totalMinutes(p)} minutes, {times[0]?.start} to {times[times.length - 1]?.end}
      </p>

      {p.blocks.map((b, i) => (
        <div key={b.id} className="practice-block">
          <div className="practice-block-head">
            <span className="practice-clock">{times[i].start}</span>
            <input
              className="notes-line"
              value={b.title}
              aria-label="Block"
              onChange={(e) => setBlock(b.id, { title: e.target.value })}
            />
            <input
              type="number"
              min={1}
              max={120}
              value={b.minutes}
              aria-label={`${b.title} minutes`}
              onChange={(e) => setBlock(b.id, { minutes: Math.max(1, Math.min(120, Number(e.target.value) || 1)) })}
            />
            <span className="practice-min">min</span>
          </div>
          <div className="practice-plays">
            {b.playIds
              .map((id) => plays.find((x) => x.id === id))
              .filter((x): x is Play => Boolean(x))
              .map((x) => (
                <button
                  key={x.id}
                  className="chip"
                  aria-label={`Take ${title(x)} off ${b.title}`}
                  onClick={() => setBlock(b.id, { playIds: b.playIds.filter((id) => id !== x.id) })}
                >
                  {title(x)} ×
                </button>
              ))}
            <select
              value=""
              aria-label={`Add a drill or play to ${b.title}`}
              onChange={(e) => e.target.value && setBlock(b.id, { playIds: [...b.playIds, e.target.value] })}
            >
              <option value="">+ Drill or play</option>
              {choices
                .filter((x) => !b.playIds.includes(x.id))
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.drill ? 'Drill: ' : ''}
                    {title(x)}
                  </option>
                ))}
            </select>
          </div>
          <div className="picker-row">
            <button className="quiet" disabled={i === 0} onClick={() => move(i, -1)}>
              Earlier
            </button>
            <button className="quiet" disabled={i === p.blocks.length - 1} onClick={() => move(i, 1)}>
              Later
            </button>
            <button
              className="quiet"
              onClick={() => onChange({ ...p, blocks: p.blocks.filter((x) => x.id !== b.id) })}
            >
              Remove
            </button>
          </div>
        </div>
      ))}

      <div className="picker-row">
        <button
          onClick={() =>
            onChange({
              ...p,
              blocks: [...p.blocks, { id: practiceId('k'), title: 'Block', minutes: 10, playIds: [] }],
            })
          }
        >
          Add block
        </button>
        <button className="danger" onClick={onDelete}>
          Delete practice
        </button>
      </div>
    </div>
  );
}
