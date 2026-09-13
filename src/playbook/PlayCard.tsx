import { autoRouteColor } from '../domain/colors';
import { computeHoles } from '../domain/holes';
import { UNFILED_SECTION, type Play, type Section } from '../domain/types';
import { useSettings } from '../store/settings';
import { AssignmentPath } from '../render/AssignmentPath';
import { Field } from '../render/Field';
import { PlayerShape } from '../render/PlayerShape';
import { VIEW_BOX, toPathD } from '../render/geometry';

/** Not a section id, just the sentinel the folder menu uses for its last row. */
export const NEW_SECTION = ' new';

interface Props {
  play: Play;
  sections: Section[];
  onOpen: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onSetSection: (id: string, sectionId: string) => void;
  onFileInNew: (id: string) => void;
}

/** The same renderer the editor uses, so a card can never drift from the play. */
export function PlayCard({
  play,
  sections,
  onOpen,
  onDuplicate,
  onDelete,
  onSetSection,
  onFileInNew,
}: Props) {
  const settings = useSettings();
  const holes = computeHoles(play.players, settings);
  const title = play.name || play.suggestedName || 'Untitled';

  // A play filed in a section that has since been deleted reads as unfiled,
  // which is where deleteSection already put it.
  const filedIn = sections.some((s) => s.id === play.sectionId)
    ? play.sectionId
    : UNFILED_SECTION;

  return (
    <div className="play-card">
      <button className="thumb" onClick={() => onOpen(play.id)} aria-label={`Open ${title}`}>
        <svg viewBox={VIEW_BOX} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <Field holes={holes} showHoles={false} />
          {play.annotations.map((path, i) => (
            <path
              key={`ann${i}`}
              d={toPathD(path)}
              fill="none"
              stroke="var(--chalk)"
              strokeWidth={0.16}
              strokeLinecap="round"
              opacity={0.7}
            />
          ))}
          {play.assignments.map((a) => (
            <AssignmentPath key={a.id} assignment={a} autoColor={autoRouteColor(a, play.players)} />
          ))}
          {play.players
            .filter((p) => p.side === 'offense')
            .map((p) => (
              <PlayerShape key={p.id} player={p} selected={false} />
            ))}
        </svg>
      </button>

      <div className="card-foot">
        <button className="card-name" onClick={() => onOpen(play.id)}>
          <strong>{title}</strong>
          {!play.name && play.suggestedName && <em>suggested</em>}
        </button>
        <div className="card-tools">
          <button className="quiet" onClick={() => onDuplicate(play.id)} title="Duplicate">
            Copy
          </button>
          <button className="quiet" onClick={() => onDelete(play.id)} title="Delete">
            Delete
          </button>
        </div>
      </div>

      {/*
        * A native select, because it is one tap on a touch device and the system
        * picker is the one control on this page a pen has never had trouble with.
        * Always rendered, so every card in a row is the same height.
        */}
      <div className="card-file">
        <select
          value={filedIn}
          aria-label={`Folder for ${title}`}
          onChange={(e) => {
            const to = e.target.value;
            if (to === NEW_SECTION) onFileInNew(play.id);
            else onSetSection(play.id, to);
          }}
        >
          <option value={UNFILED_SECTION}>Unfiled</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          <option value={NEW_SECTION}>New folder</option>
        </select>
      </div>

      {play.tags.length > 0 && (
        <div className="card-tags">
          {play.tags.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}
