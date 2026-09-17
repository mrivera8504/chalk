import { autoRouteColor } from '../domain/colors';
import { computeHoles } from '../domain/holes';
import { refreshPaths } from '../domain/regenerate';
import { UNFILED_SECTION, quarterback, type Play, type Section } from '../domain/types';
import { useSettings } from '../store/settings';
import { AssignmentPath } from '../render/AssignmentPath';
import { Field } from '../render/Field';
import { PlayerShape } from '../render/PlayerShape';
import { FocusSquare } from '../render/FocusSquare';
import { ZoneArea } from '../render/Zone';
import { VisionCone } from '../render/VisionCone';
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
  const qb = quarterback(play.players);
  const title = play.name || play.suggestedName || 'Untitled';

  /*
   * A defensive play shows both sides: the front is the play, and without the
   * look it is set against there is nothing for it to be lined up on. Unless
   * the coach took the look off, which the card has to honour too — a thumbnail
   * showing an offense the play no longer draws is the card lying about what
   * opening it will give you. An offensive play still shows only its own side.
   */
  const shownPlayers = play.players.filter((p) =>
    p.side === 'offense' ? !play.hideOffense : play.unit === 'defense',
  );

  /* Regenerated from everyone, then cut to the men on the board — a block and a
     cover rope are functions of both ends, so they are rebuilt before filtering
     and never from a half-empty roster. */
  const shownLines = refreshPaths(play.assignments, play.players).filter((a) =>
    shownPlayers.some((p) => p.id === a.playerId),
  );

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
          {/* Under the play, exactly as on the board. */}
          {(play.zones ?? []).map((z) => (
            <ZoneArea
              key={`zone${z.playerId}`}
              zone={z}
              player={play.players.find((p) => p.id === z.playerId) ?? null}
            />
          ))}
          {/* Both washes hang off a man, so neither outlives the one it
              comes off — as on the board and on the sheet. */}
          {(play.focuses ?? []).map((f) => {
            const man = shownPlayers.find((p) => p.id === f.playerId);
            return man ? (
              <FocusSquare key={`focus${f.playerId}`} player={man} focus={f} />
            ) : null;
          })}
          {play.vision && qb && !play.hideOffense && (
            <VisionCone qb={qb} vision={play.vision} />
          )}
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
          {/*
            * Regenerated, not as stored. A block, a cover rope and a stunt are
            * all stored as who-does-what-to-whom, so a thumbnail that drew the
            * saved path would be showing where those men used to stand.
            */}
          {shownLines.map((a) => (
            <AssignmentPath key={a.id} assignment={a} autoColor={autoRouteColor(a, play.players)} />
          ))}
          {shownPlayers.map((p) => (
            <PlayerShape
              key={p.id}
              player={p}
              selected={false}
              ball={p.id === play.ballCarrierId}
            />
          ))}
        </svg>
      </button>

      {/*
        * Name on its own line, everything else under it. Sharing a row with
        * Copy and Delete left the name about seventy pixels on a phone, which
        * is 'Sweep…' for every play in the book.
        */}
      <div className="card-foot">
        <button className="card-name" onClick={() => onOpen(play.id)}>
          <strong>{title}</strong>
          <span className="card-sub">
            {/* Which side of the ball, where the name is read. Defence only: an
                unmarked play is an offensive one, which is what every play in
                this book was before there was anything else to be. */}
            {play.unit === 'defense' && <em className="unit-tag">DEF</em>}
            {!play.name && play.suggestedName && <em>suggested name</em>}
          </span>
        </button>
      </div>

      <div className="card-actions">
        {/*
          * A native select, because it is one tap on a touch device and the
          * system picker is the one control on this page a pen has never had
          * trouble with. Always rendered, so every card in a row is the same
          * height.
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

        <div className="card-tools">
          <button className="quiet" onClick={() => onDuplicate(play.id)} title="Duplicate">
            Copy
          </button>
          <button
            className="quiet danger"
            onClick={() => onDelete(play.id)}
            title={`Delete ${title}`}
          >
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
