import { useMemo, useState } from 'react';
import { useBackLayer } from '../ui/backstack';
import {
  STATUS_LABEL,
  UNFILED_SECTION,
  type Book,
  type Play,
  type PlayStatus,
  type Section,
  type Side,
} from '../domain/types';
import { PageHead } from '../shell/AppShell';
import type { SyncState } from '../store/sync';
import { SPORTS, anyVariant, football, isFootball, sportOf } from '../sports';
import { go } from '../ui/route';
import { askChoice, askConfirm, askText } from '../ui/dialog';
import { Icon } from '../ui/Icon';
import { Menu } from '../ui/Menu';
import { PlayCard } from './PlayCard';
import { HistoryDialog } from './HistoryDialog';
import type { Revision } from '../store/cloud2';

interface Props {
  plays: Play[];
  /** Thrown away, newest first. Still in the book until the trash is emptied. */
  trashed: Play[];
  sections: Section[];
  sync: SyncState;
  /** When a backup file was last written, or null if one never has been. */
  lastBackupAt: number | null;
  onRestorePlay: (id: string) => void;
  onEmptyTrash: () => void;
  onOpen: (id: string) => void;
  onNew: (unit?: Side | 'drill') => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onAddSection: (name: string) => Section;
  onRenameSection: (id: string, name: string) => void;
  onDeleteSection: (id: string) => void;
  onSetSection: (id: string, sectionId: string) => void;
  /** Put a play in front of another one. */
  onMovePlay: (id: string, beforeId: string | null) => void;
  onSetStatus: (id: string, status: PlayStatus | undefined) => void;
  /** The copies a play's saves have replaced, newest first. */
  onRevisions: (playId: string) => Promise<Revision[]>;
  onSharePlay: (play: Play) => void;
  onUnsharePlay: (play: Play) => void;
  /** The whole playbook on screen, as one link. */
  onShareBook: (book: Book, plays: Play[]) => void;
  onUnshareBook: (book: Book) => void;
  onRestoreRevision: (play: Play) => void;
  /** Every playbook, and which one this screen is showing. */
  books: Book[];
  bookId: string;
  onSelectBook: (id: string) => void;
  onAddBook: (name: string, variant?: string) => void;
  onSetBookVariant: (id: string, variant?: string) => void;
  /** A handful of everyday plays for this playbook's game, in a folder of their own. */
  onAddStarters: () => void;
  onRenameBook: (id: string, name: string) => void;
  /** False when it is the last one, which cannot go. */
  onDeleteBook: (id: string) => boolean;
  /** Several plays at once, from Select. One toast and one Undo for the lot. */
  onMoveMany?: (ids: string[], sectionId: string) => void;
  onDeleteMany?: (ids: string[]) => void;
  /** The team whose playbook this is, when it is not the coach's own. */
  team?: string;
  onOwnBook?: () => void;
}

/*
 * These used to collapse to one string, so a refused write looked exactly like
 * a cloud that had not been tried yet, and the console said nothing either.
 * Silent degradation is worse than no sync at all: everything looks fine right
 * up until the device is lost.
 */
const SYNC_LABEL: Record<SyncState, string> = {
  local: 'on this device',
  syncing: 'saving',
  synced: 'saved',
  large: 'saved — this playbook is getting large',
  offline: 'this device only, offline',
  denied: 'this device only, cloud refused',
  blocked: 'not saved — this would delete most of your plays',
  toobig: 'this device only — too big for the cloud, empty the trash',
  failed: 'this device only — the cloud save failed',
};

/*
 * The states a coach has to do something about, as against the ones that pass
 * on their own. Offline is not one of them — a field with no signal is the
 * normal condition this app was built for, and coloring it red would teach
 * everybody to ignore the color by the second practice.
 */
const NEEDS_ACTION = new Set<SyncState>(['denied', 'blocked', 'toobig', 'failed']);

/** What a playbook is for, in two words: `11-man football`, `Basketball`. */
function kindLabel(variant?: string) {
  const sport = sportOf(variant);
  return sport === football ? `${anyVariant(variant).name} football` : sport.name;
}

/** The kinds of football, as a question, with the current one marked. */
function kinds(current?: string) {
  const now = anyVariant(current).id;
  return SPORTS.flatMap((sport) =>
    sport.variants.map((v) => ({
      id: v.id,
      // Football's kinds are named by their number; anything else by its sport.
      label: sport === football ? v.name : `${sport.name} · ${v.name.toLowerCase()}`,
      sub: v.blurb,
      current: v.id === now,
    })),
  );
}

export function PlaybookList({
  plays,
  trashed,
  sections,
  sync,
  lastBackupAt,
  onRestorePlay,
  onEmptyTrash,
  onOpen,
  onNew,
  onDuplicate,
  onDelete,
  onAddSection,
  onRenameSection,
  onDeleteSection,
  onSetSection,
  onMovePlay,
  onSetStatus,
  onRevisions,
  onSharePlay,
  onUnsharePlay,
  onShareBook,
  onUnshareBook,
  onRestoreRevision,
  books,
  bookId,
  onSelectBook,
  onAddBook,
  onSetBookVariant,
  onAddStarters,
  onRenameBook,
  onDeleteBook,
  team,
  onOwnBook,
  onMoveMany,
  onDeleteMany,
}: Props) {
  /**
   * The plays ticked in Select, or null when not selecting.
   *
   * While selecting, a tap on a card ticks it instead of opening it, and the
   * new-play buttons give way to what can be done to the ticked ones. The back
   * gesture leaves the mode before it leaves the screen.
   */
  const [picked, setPicked] = useState<Set<string> | null>(null);
  useBackLayer(picked !== null, () => setPicked(null));
  const togglePick = (id: string) =>
    setPicked((prev) => {
      if (!prev) return prev;
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const [query, setQuery] = useState('');
  const [showTrash, setShowTrash] = useState(false);

  /**
   * Days since the last backup, or null when there is nothing worth saying.
   *
   * Silent under a week, because a line that is always there is a line nobody
   * reads — and this one has to still register the day it matters.
   */
  const backupAge = useMemo(() => {
    if (!plays.length) return null;
    if (!lastBackupAt) return Infinity;
    const days = Math.floor((Date.now() - lastBackupAt) / 86_400_000);
    return days >= 7 ? days : null;
  }, [plays.length, lastBackupAt]);

  /**
   * Which unit is on show. Not a folder: a coach files by concept — goal line,
   * first down — and every one of those folders can hold both sides of the ball.
   * The unit is a fact about the play, so it filters across the folders rather
   * than sorting the plays into two of them.
   */
  const [unit, setUnit] = useState<Side | 'all' | 'drill'>('all');
  const [dragging, setDragging] = useState<string | null>(null);
  const [historyOf, setHistoryOf] = useState<Play | null>(null);
  /** Where the team is with a play, as a filter. Offered once any play says. */
  const [status, setStatus] = useState<PlayStatus | 'all'>('all');
  const book = books.find((b) => b.id === bookId) ?? books[0];

  async function newBook() {
    const name = await askText('New playbook', {
      placeholder: 'JV offense',
      label: 'Playbook name',
      confirmLabel: 'Add playbook',
    });
    if (!name) return;
    // Asked second, and defaulting to what this playbook already is: a coach
    // adding "JV offense" is nearly always adding more of the same game.
    const kind = await askChoice('What is this playbook for?', kinds(book.variant), {
      body: `Every new play in ${name} opens with this many on the field.`,
    });
    if (kind) onAddBook(name, kind);
  }

  async function changeKind() {
    const kind = await askChoice('What is this playbook for?', kinds(book.variant), {
      body: 'For the plays you make from here on. The ones already drawn stay as they are.',
    });
    if (kind) onSetBookVariant(book.id, kind);
  }

  async function renameBook() {
    const name = await askText('Rename playbook', { value: book.name, label: 'Playbook name' });
    if (name) onRenameBook(book.id, name);
  }

  async function deleteBook() {
    const ok = await askConfirm(`Delete the playbook “${book.name}”?`, {
      body: plays.length
        ? `Its ${plays.length} ${plays.length === 1 ? 'play goes' : 'plays go'} to Deleted in ${
            books.find((b) => b.id !== book.id)?.name ?? 'the other playbook'
          }, where they can be put back. Its folders go with it.`
        : 'It has no plays in it.',
      confirmLabel: 'Delete playbook',
      danger: true,
    });
    if (ok) onDeleteBook(book.id);
  }

  /** Name, suggested name, tags and notes all match, because coaches search by feel. */
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ofStatus = status === 'all' ? plays : plays.filter((p) => p.status === status);
    const ofUnit =
      unit === 'all'
        ? ofStatus
        : unit === 'drill'
          ? ofStatus.filter((p) => p.drill)
          : ofStatus.filter((p) => !p.drill && (p.unit ?? 'offense') === unit);
    if (!q) return ofUnit;
    return ofUnit.filter((p) =>
      [p.name, p.suggestedName ?? '', p.notes, p.coachingPoint, ...p.tags]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [plays, query, unit, status]);

  const searching = query.trim().length > 0 || unit !== 'all' || status !== 'all';

  const grouped = useMemo(() => {
    const known = [...sections].sort((a, b) => a.order - b.order);
    const buckets = known.map((s) => ({
      section: s,
      plays: matches.filter((p) => p.sectionId === s.id),
    }));
    const unfiled = matches.filter((p) => !known.some((s) => s.id === p.sectionId));
    if (unfiled.length) {
      buckets.push({
        section: { id: UNFILED_SECTION, name: 'Unfiled', order: Infinity },
        plays: unfiled,
      });
    }
    /*
     * An empty folder still shows, otherwise creating one looked like the button
     * did nothing at all: the section was made and saved, and then filtered out
     * of the only view of it. A folder with nothing in it is also the only thing
     * to drop the first play into.
     *
     * Under a search it does go, because an empty folder is not a result.
     */
    return searching ? buckets.filter((b) => b.plays.length > 0) : buckets;
  }, [matches, sections, searching]);

  async function addSection() {
    const name = await askText('New folder', {
      placeholder: 'Goal line',
      label: 'Folder name',
      confirmLabel: 'Add folder',
    });
    if (name) onAddSection(name);
  }

  /** Make a folder and drop this play straight into it, in one question. */
  async function fileInNew(playId: string) {
    const name = await askText('New folder', {
      body: 'The play goes straight into it.',
      placeholder: 'Goal line',
      label: 'Folder name',
      confirmLabel: 'Add folder',
    });
    if (name) onSetSection(playId, onAddSection(name).id);
  }

  async function renameSection(s: Section) {
    const name = await askText('Rename folder', { value: s.name, label: 'Folder name' });
    if (name) onRenameSection(s.id, name);
  }

  async function deleteSection(s: Section, count: number) {
    const ok = await askConfirm(`Delete the folder “${s.name}”?`, {
      body: count
        ? `The ${count} ${count === 1 ? 'play goes' : 'plays go'} back to Unfiled. Nothing is lost.`
        : 'It is empty, so nothing goes with it.',
      confirmLabel: 'Delete folder',
      danger: true,
    });
    if (ok) onDeleteSection(s.id);
  }

  return (
    <div className="page playbook">
      <PageHead
        title={
          /*
           * The playbook's name is the button that changes playbook. One book
           * and nobody needs to know there could be more; the menu is where a
           * second one starts.
           */
          <Menu
            label="Change playbook"
            trigger={
              <>
                {book.name}
                <Icon name="chevron" size={18} />
              </>
            }
          >
            {(close) => (
              <>
                {books.length > 1 &&
                  books.map((b) => (
                    <button
                      key={b.id}
                      role="menuitemradio"
                      aria-checked={b.id === book.id}
                      onClick={() => {
                        close();
                        onSelectBook(b.id);
                      }}
                    >
                      {b.name}
                    </button>
                  ))}
                {books.length > 1 && <hr />}
                <button
                  role="menuitem"
                  onClick={() => {
                    close();
                    void newBook();
                  }}
                >
                  New playbook
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    close();
                    void renameBook();
                  }}
                >
                  Rename this one
                </button>
                <button
                  role="menuitem"
                  disabled={!plays.length}
                  onClick={() => {
                    close();
                    onShareBook(book, plays);
                  }}
                >
                  {book.shareToken ? 'Share link (update)' : 'Share as a link'}
                </button>
                {book.shareToken && (
                  <button
                    role="menuitem"
                    onClick={() => {
                      close();
                      onUnshareBook(book);
                    }}
                  >
                    Stop sharing it
                  </button>
                )}
                <button
                  role="menuitem"
                  onClick={() => {
                    close();
                    onAddStarters();
                  }}
                >
                  Add starter plays
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    close();
                    void changeKind();
                  }}
                >
                  {kindLabel(book.variant)}…
                </button>
                {/* The last one cannot go: a play has to be somewhere. */}
                {books.length > 1 && (
                  <button
                    role="menuitem"
                    className="danger"
                    onClick={() => {
                      close();
                      void deleteBook();
                    }}
                  >
                    Delete this one
                  </button>
                )}
              </>
            )}
          </Menu>
        }
        sub={
          <>
            <span className={`sync${NEEDS_ACTION.has(sync) ? ' bad' : ''}`}>{SYNC_LABEL[sync]}</span>
            {/*
              * Only once it is worth saying. A book with nothing in it has
              * nothing to back up, and a file written this morning is not news —
              * the line is here for the gap, not for the reassurance.
              */}
            {backupAge !== null && (
              <span className={`backup-age${backupAge >= 14 ? ' stale' : ''}`}>
                {backupAge === Infinity ? 'never backed up' : `last backup ${backupAge}d ago`}
              </span>
            )}
          </>
        }
      >
        <button className="quiet with-icon" onClick={() => void addSection()}>
          <Icon name="folder" size={18} />
          Add folder
        </button>
        {(onMoveMany || onDeleteMany) && plays.length > 1 && (
          <button
            className="quiet"
            aria-pressed={picked !== null}
            onClick={() => setPicked(picked ? null : new Set())}
          >
            {picked ? 'Done' : 'Select'}
          </button>
        )}
        {/* A place with its own address, so the sideline survives a reload. */}
        {plays.length > 0 && (
          <button className="quiet" onClick={() => go({ screen: 'gameday' })}>
            Game day
          </button>
        )}
      </PageHead>

      {/*
        * Whose book this is, said every time it is not the coach's own — every
        * edit made here lands in somebody else's playbook.
        */}
      {team && (
        <div className="team-on">
          <span>
            Coaching on <b>{team}</b>
          </span>
          {onOwnBook && (
            <button className="quiet" onClick={onOwnBook}>
              Your own playbook
            </button>
          )}
        </div>
      )}

      {/* Finding a play. */}
      <div className="book-find">
        <label className="search">
          <Icon name="search" size={18} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search plays, tags, notes"
            spellCheck={false}
            aria-label="Search"
          />
        </label>
        {/*
          * Only there once there is something to filter. One unit's playbook
          * showing an Offense/Defense switch is two buttons that do nothing.
          */}
        {(plays.some((p) => p.unit === 'defense') || plays.some((p) => p.drill)) && (
          <div className="unit-filter">
            {(
              [
                'all',
                'offense',
                ...(plays.some((p) => p.unit === 'defense') ? (['defense'] as const) : []),
                ...(plays.some((p) => p.drill) ? (['drill'] as const) : []),
              ] as const
            ).map((u) => (
              <button key={u} aria-pressed={unit === u} onClick={() => setUnit(u)}>
                {u === 'all' ? 'All' : u === 'offense' ? 'Plays' : u === 'defense' ? 'Defense' : 'Drills'}
              </button>
            ))}
          </div>
        )}
        {/* Likewise: no status filter until some play has a status. */}
        {plays.some((p) => p.status) && (
          <select
            className="status-filter"
            aria-label="Filter by status"
            value={status}
            onChange={(e) => setStatus(e.target.value as PlayStatus | 'all')}
          >
            <option value="all">Any status</option>
            {(Object.keys(STATUS_LABEL) as PlayStatus[]).map((k) => (
              <option key={k} value={k}>
                {STATUS_LABEL[k]}
              </option>
            ))}
          </select>
        )}
      </div>

      {plays.length === 0 && sections.length === 0 ? (
        <div className="empty">
          <strong>No plays yet</strong>
          <p>Start a play and it saves itself as you draw.</p>
          {/* For the coach who would rather edit than start from nothing. */}
          <button onClick={onAddStarters}>Add starter plays</button>
        </div>
      ) : grouped.length === 0 ? (
        <div className="empty">
          <strong>Nothing matches</strong>
          <p>{query.trim() ? `No play matches “${query.trim()}”.` : 'No plays match that filter.'}</p>
        </div>
      ) : (
        grouped.map(({ section, plays: inSection }) => (
          <section key={section.id}>
            <div className="folder-head">
              <h2>
                {section.name} <span>{inSection.length}</span>
              </h2>
              {/* Unfiled is not a real folder, so it has nothing to rename. */}
              {section.id !== UNFILED_SECTION && (
                <Menu label={`More for the folder ${section.name}`}>
                  {(close) => (
                    <>
                      <button
                        role="menuitem"
                        onClick={() => {
                          close();
                          void renameSection(section);
                        }}
                      >
                        Rename
                      </button>
                      <button
                        role="menuitem"
                        className="danger"
                        onClick={() => {
                          close();
                          void deleteSection(section, inSection.length);
                        }}
                      >
                        Delete folder
                      </button>
                    </>
                  )}
                </Menu>
              )}
            </div>
            {inSection.length === 0 ? (
              <p className="empty-folder">
                Empty. Move a play here from the menu on its card.
              </p>
            ) : (
              <div className="card-grid">
                {inSection.map((play) => (
                  <div
                    key={play.id}
                    draggable
                    onDragStart={() => setDragging(play.id)}
                    onDragEnd={() => setDragging(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragging && dragging !== play.id) {
                        onMovePlay(dragging, play.id);
                        // Dropping a card into a folder files it there too,
                        // otherwise it lands in the middle of a list it is not
                        // a member of and jumps back on the next render.
                        onSetSection(dragging, section.id);
                      }
                      setDragging(null);
                    }}
                    className={
                      [dragging === play.id && 'card-drag', picked?.has(play.id) && 'card-picked']
                        .filter(Boolean)
                        .join(' ') || undefined
                    }
                    onClickCapture={(e) => {
                      if (!picked) return;
                      // Selecting: a tap anywhere on the card ticks it.
                      e.preventDefault();
                      e.stopPropagation();
                      togglePick(play.id);
                    }}
                  >
                    <PlayCard
                      play={play}
                      sections={sections}
                      onOpen={onOpen}
                      onDuplicate={onDuplicate}
                      onDelete={onDelete}
                      onSetSection={onSetSection}
                      onFileInNew={fileInNew}
                      onSetStatus={onSetStatus}
                      onHistory={setHistoryOf}
                      onShare={onSharePlay}
                      onUnshare={onUnsharePlay}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        ))
      )}

      {/*
        * The trash, and only when there is one.
        *
        * Deleting has to keep feeling final — the play leaves every list the
        * moment it goes — so this is a closed row at the bottom rather than a
        * folder among the folders. It is the door that makes the delete
        * recoverable, not a place anybody is meant to work in.
        */}
      {trashed.length > 0 && (
        <section className="trash">
          <button className="trash-head quiet" onClick={() => setShowTrash((s) => !s)}>
            Deleted ({trashed.length})
          </button>

          {showTrash && (
            <div className="trash-body">
              {trashed.map((play) => (
                <div key={play.id} className="trash-row">
                  <span className="trash-name">
                    {play.name || play.suggestedName || 'Untitled play'}
                  </span>
                  <button onClick={() => onRestorePlay(play.id)}>Put back</button>
                </div>
              ))}
              <div className="trash-foot">
                <button
                  className="danger"
                  onClick={() =>
                    void askConfirm(`Delete ${trashed.length} for good?`, {
                      body:
                        'These are still in your backups, but they leave this playbook ' +
                        'and the cloud copy for good.',
                      confirmLabel: 'Delete for good',
                      danger: true,
                    }).then((ok) => ok && onEmptyTrash())
                  }
                >
                  Empty
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/*
        * Starting a play: the one thing this screen is for, so it is the one
        * filled button on it and it stays put while the list scrolls.
        *
        * Two buttons rather than a choice inside the editor: a play is one unit
        * or the other from the moment it exists, because every line drawn on
        * it was drawn for one of them.
        */}
      {historyOf && (
        <HistoryDialog
          play={historyOf}
          load={onRevisions}
          onRestore={onRestoreRevision}
          onClose={() => setHistoryOf(null)}
        />
      )}

      {picked ? (
        <div className="book-new book-picked">
          <span className="picked-count">
            {picked.size} {picked.size === 1 ? 'play' : 'plays'}
          </span>
          {onMoveMany && (
            <select
              aria-label="Move the selected plays to a folder"
              value=""
              disabled={!picked.size}
              onChange={(e) => {
                if (!e.target.value) return;
                onMoveMany([...picked], e.target.value);
                setPicked(null);
              }}
            >
              <option value="">Move to…</option>
              <option value={UNFILED_SECTION}>Unfiled</option>
              {sections.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  {sec.name}
                </option>
              ))}
            </select>
          )}
          {onDeleteMany && (
            <button
              className="danger"
              disabled={!picked.size}
              onClick={() => {
                onDeleteMany([...picked]);
                setPicked(null);
              }}
            >
              Delete
            </button>
          )}
        </div>
      ) : (
      <div className="book-new">
        {/*
          * A court has no second unit to draw for: a basketball play is a set
          * with the defense standing in it, not one side's half of a snap.
          */}
        {isFootball(book.variant) && <button onClick={() => onNew('defense')}>New defense</button>}
        {/* Any sport, any playbook: an empty board with the equipment row. */}
        <button onClick={() => onNew('drill')}>New drill</button>
        <button className="primary with-icon" onClick={() => onNew('offense')}>
          <Icon name="plus" size={20} />
          New play
        </button>
      </div>
      )}
    </div>
  );
}
