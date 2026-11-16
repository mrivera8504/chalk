import {
  UNFILED_SECTION,
  playSurface,
  STATUS_LABEL,
  type Play,
  type PlayStatus,
  type Section,
} from '../domain/types';
import { useSettings, boardVars } from '../store/settings';
import { viewForPlays } from '../export/view';
import { Menu } from '../ui/Menu';
import { PlayPicture } from '../render/PlayPicture';

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
  onSetStatus: (id: string, status: PlayStatus | undefined) => void;
  onHistory: (play: Play) => void;
  /** Make (or refresh) a link a player can open with no account. */
  onShare: (play: Play) => void;
  /** Take the link down. Offered only while there is one. */
  onUnshare: (play: Play) => void;
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
  onSetStatus,
  onHistory,
  onShare,
  onUnshare,
}: Props) {
  const settings = useSettings();
  const title = play.name || play.suggestedName || 'Untitled';

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
        <PlayPicture play={play} view={view} showDefense={settings.showDefense} />
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
            {play.status && <em className={`status-tag ${play.status}`}>{STATUS_LABEL[play.status]}</em>}
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
              {/* Where the team is with it. Native, like the folder above. */}
              <label className="menu-field">
                <span>Status</span>
                <select
                  value={play.status ?? ''}
                  aria-label={`Status of ${title}`}
                  onChange={(e) => {
                    close();
                    onSetStatus(play.id, (e.target.value || undefined) as PlayStatus | undefined);
                  }}
                >
                  <option value="">Not set</option>
                  {(Object.keys(STATUS_LABEL) as PlayStatus[]).map((k) => (
                    <option key={k} value={k}>
                      {STATUS_LABEL[k]}
                    </option>
                  ))}
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
                onClick={() => {
                  close();
                  onHistory(play);
                }}
              >
                Earlier versions
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  close();
                  onShare(play);
                }}
              >
                {/* The same link again, with the newest version behind it. */}
                {play.shareToken ? 'Share link (update)' : 'Share link'}
              </button>
              {play.shareToken && (
                <button
                  role="menuitem"
                  onClick={() => {
                    close();
                    onUnshare(play);
                  }}
                >
                  Stop sharing
                </button>
              )}
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
