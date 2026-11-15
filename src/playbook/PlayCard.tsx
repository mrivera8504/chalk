import { autoRouteColor } from '../domain/colors';
import { computeHoles } from '../domain/holes';
import { refreshPaths } from '../domain/regenerate';
import {
  UNFILED_SECTION,
  drawnSides,
  playSurface,
  quarterback,
  type Play,
  type Section,
} from '../domain/types';
import { useSettings, boardVars } from '../store/settings';
import { AssignmentPath } from '../render/AssignmentPath';
import { Field } from '../render/Field';
import { PlayerShape } from '../render/PlayerShape';
import { FocusSquare } from '../render/FocusSquare';
import { ZoneArea } from '../render/Zone';
import { VisionCone } from '../render/VisionCone';
import { toPathD } from '../render/geometry';
import { viewBox, viewForPlays } from '../export/view';
import { Menu } from '../ui/Menu';

/** Not a section id, just the sentinel the folder menu uses for its last row. */
export const NEW_SECTION = ' new';

/** The frame a card's picture sits in: four across, three down. */
const THUMB_ASPECT = 4 / 3;

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
   * The same rule the board and the sheet use, so a card cannot say one thing
   * about a play and opening it say another.
   */
  const sides = drawnSides(play, settings.showDefense);
  const shownPlayers = play.players.filter((p) =>
    p.side === 'defense' ? sides.defense : sides.offense,
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

  /*
   * The window the sheet would give this play, not the whole board.
   *
   * The board is 22 yards by 30 because a phone is taller than it is wide, and
   * almost no play uses all thirty: a card drawn from the full window was two
   * thirds empty grass with the play small in the middle of it, and tall enough
   * that a phone showed three plays a screen. `viewForPlays` is the rule the
   * printed sheet already follows — everything the play draws, padded, never
   * cropped, leaned toward the shape it is going into — so a card is the play
   * at the size it deserves, and the same picture a coach gets on paper.
   */
  const view = viewForPlays([play], THUMB_ASPECT);

  return (
    <div className="play-card">
      {/* Whichever surface the board is set to, so a card looks like the play
          it opens. The properties inherit to everything drawn below, and to
          the turf behind it where the window does not fill the frame. */}
      <button
        className="thumb"
        onClick={() => onOpen(play.id)}
        aria-label={`Open ${title}`}
        style={boardVars(playSurface(play, settings.fieldSurface))}
      >
        <svg viewBox={viewBox(view)} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <Field holes={holes} showHoles={false} view={view} />
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
          {play.vision && qb && sides.offense && (
            <VisionCone qb={qb} vision={play.vision} />
          )}
          {play.annotations.map((path, i) => (
            <path
              key={`ann${i}`}
              d={toPathD(path)}
              fill="none"
              stroke="var(--board-chalk)"
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
        * The name, and one button for everything else.
        *
        * A card used to wear a folder select, Copy and Delete on its face. Those
        * are things done to a play once in a while, and they stood between a
        * coach and the thumbnails he was scanning — and before that they shared
        * a row with the name, which left it seventy pixels and read 'Sweep…'
        * for every play in the book.
        */}
      <div className="card-foot">
        <button className="card-name" onClick={() => onOpen(play.id)}>
          <strong>{title}</strong>
          <span className="card-sub">
            {/* Which side of the ball, where the name is read. Defense only: an
                unmarked play is an offensive one, which is what every play in
                this book was before there was anything else to be. */}
            {play.unit === 'defense' && <em className="unit-tag">DEF</em>}
            {!play.name && play.suggestedName && <em>suggested name</em>}
          </span>
        </button>

        <Menu label={`More for ${title}`}>
          {(close) => (
            <>
              {/*
                * Still a native select. It is one tap on a touch device and the
                * system picker is the one control a pen has never had trouble
                * with — that was true on the card's face and it is true here.
                */}
              <label className="menu-field">
                <span>Folder</span>
                <select
                  value={filedIn}
                  aria-label={`Folder for ${title}`}
                  onChange={(e) => {
                    const to = e.target.value;
                    close();
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
              </label>
              <button
                role="menuitem"
                onClick={() => {
                  close();
                  onDuplicate(play.id);
                }}
              >
                Duplicate
              </button>
              <button
                role="menuitem"
                className="danger"
                onClick={() => {
                  close();
                  onDelete(play.id);
                }}
              >
                Delete
              </button>
            </>
          )}
        </Menu>
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
