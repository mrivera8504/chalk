import { computeHoles } from '../domain/holes';
import { DEFAULT_SETTINGS, type Play } from '../domain/types';
import { AssignmentPath } from '../render/AssignmentPath';
import { Field } from '../render/Field';
import { PlayerShape } from '../render/PlayerShape';
import { VIEW_BOX, toPathD } from '../render/geometry';

interface Props {
  play: Play;
  onOpen: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

/** The same renderer the editor uses, so a card can never drift from the play. */
export function PlayCard({ play, onOpen, onDuplicate, onDelete }: Props) {
  const holes = computeHoles(play.players, DEFAULT_SETTINGS);
  const title = play.name || play.suggestedName || 'Untitled';

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
            <AssignmentPath key={a.id} assignment={a} />
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
