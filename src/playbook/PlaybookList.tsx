import { useMemo, useState } from 'react';
import { ExportPanel } from '../export/ExportPanel';
import { AccountPanel } from './AccountPanel';
import { RosterPanel } from './RosterPanel';
import { readRoster, type RosterEntry } from '../domain/roster';
import { useInstallPrompt } from '../store/install';
import { UNFILED_SECTION, type Play, type Section, type Side } from '../domain/types';
import type { SyncState } from '../store/sync';
import { askConfirm, askText } from '../ui/dialog';
import { SettingsPanel } from '../editor/SettingsPanel';
import { useSettings } from '../store/settings';
import { PlayCard } from './PlayCard';

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
  onNew: (unit?: Side) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onAddSection: (name: string) => Section;
  onRenameSection: (id: string, name: string) => void;
  onDeleteSection: (id: string) => void;
  onSetSection: (id: string, sectionId: string) => void;
  onMovePlay: (id: string, toIndex: number) => void;
  onExport: () => void;
  /** Put a backup file back. Throws with something readable if it is not one. */
  onRestore: (text: string) => void;
  onSaveNow: () => Promise<void>;
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
 * normal condition this app was built for, and colouring it red would teach
 * everybody to ignore the colour by the second practice.
 */
const NEEDS_ACTION = new Set<SyncState>(['denied', 'blocked', 'toobig', 'failed']);

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
  onExport,
  onRestore,
  onSaveNow,
}: Props) {
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
  const [unit, setUnit] = useState<Side | 'all'>('all');
  const [dragging, setDragging] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [account, setAccount] = useState(false);
  const [rostering, setRostering] = useState(false);
  /** The once-a-season controls, folded away behind one button. */
  const [more, setMore] = useState(false);
  /*
   * Settings from here as well as from inside a play. Every one of them — the
   * colours, the pen, the board, the league rules — is the same on every play
   * in the book, so having to open a play to reach them was asking a coach to
   * go through a thing he did not want to change to get at a thing he did.
   */
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settings = useSettings();
  const [roster, setRoster] = useState<RosterEntry[]>(readRoster);
  const install = useInstallPrompt();

  /** Name, suggested name, tags and notes all match, because coaches search by feel. */
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ofUnit = unit === 'all' ? plays : plays.filter((p) => (p.unit ?? 'offense') === unit);
    if (!q) return ofUnit;
    return ofUnit.filter((p) =>
      [p.name, p.suggestedName ?? '', p.notes, p.coachingPoint, ...p.tags]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [plays, query, unit]);

  const searching = query.trim().length > 0 || unit !== 'all';

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
    <div className="playbook">
      <header>
        <h1>Playbook</h1>
        <span className={`sync${NEEDS_ACTION.has(sync) ? ' bad' : ''}`}>{SYNC_LABEL[sync]}</span>
        {/*
          * Only once it is worth saying. A book with nothing in it has nothing
          * to back up, and a file written this morning is not news — the line
          * is here for the gap, not for the reassurance.
          */}
        {backupAge !== null && (
          <span className={`backup-age${backupAge >= 14 ? ' stale' : ''}`}>
            {backupAge === Infinity ? 'never backed up' : `last backup ${backupAge}d ago`}
          </span>
        )}
      </header>

      <div className="book-tools">
        {/* Finding a play. */}
        <div className="book-row">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search plays, tags, notes"
            spellCheck={false}
            aria-label="Search"
          />
          {/*
            * Only there once there is something to filter. One unit's playbook
            * showing an Offense/Defense switch is two buttons that do nothing.
            */}
          {plays.some((p) => p.unit === 'defense') && (
            <div className="unit-filter">
              {(['all', 'offense', 'defense'] as const).map((u) => (
                <button key={u} aria-pressed={unit === u} onClick={() => setUnit(u)}>
                  {u === 'all' ? 'All' : u === 'offense' ? 'Offense' : 'Defense'}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Starting one, and then everything else. */}
        <div className="book-row">
          <button className="primary" onClick={() => onNew('offense')}>
            New play
          </button>
          {/*
            * Its own button rather than a choice inside the editor: a play is one
            * unit or the other from the moment it exists, because every line
            * drawn on it was drawn for one of them.
            */}
          <button onClick={() => onNew('defense')}>New defense</button>
          <span className="spacer" />
          <button className="quiet" onClick={() => void addSection()}>
            Add folder
          </button>
          {/*
            * The roster, the sheets, the account and the install prompt live
            * behind this. Every one of them is something a coach does once a
            * season, and all four sitting in the same row as New play is what
            * made this screen a wall of identical grey.
            */}
          <button
            className="quiet"
            aria-expanded={more}
            aria-label={more ? 'Fewer options' : 'More options'}
            onClick={() => setMore((v) => !v)}
          >
            ⋯
          </button>
        </div>
      </div>

      {more && (
        <div className="book-more">
          <button
            className="quiet"
            onClick={() => {
              setExporting(false);
              setAccount(false);
              setSettingsOpen(false);
              setRostering((v) => !v);
            }}
            aria-pressed={rostering}
          >
            Roster{roster.length ? ` · ${roster.length}` : ''}
          </button>
          <button
            className="quiet"
            onClick={() => {
              setAccount(false);
              setRostering(false);
              setSettingsOpen(false);
              setExporting((v) => !v);
            }}
            aria-pressed={exporting}
          >
            Export &amp; backup
          </button>
          <button
            className="quiet"
            onClick={() => {
              setExporting(false);
              setRostering(false);
              setSettingsOpen(false);
              setAccount((v) => !v);
            }}
            aria-pressed={account}
          >
            Account
          </button>
          <button
            className="quiet"
            onClick={() => {
              setExporting(false);
              setRostering(false);
              setAccount(false);
              setSettingsOpen((v) => !v);
            }}
            aria-pressed={settingsOpen}
          >
            Settings
          </button>
          {/* Only there when the browser has actually offered; see useInstallPrompt. */}
          {install && (
            <button className="quiet" onClick={install}>
              Install
            </button>
          )}
        </div>
      )}

      {account && <AccountPanel onSaveNow={onSaveNow} onClose={() => setAccount(false)} />}

      {settingsOpen && (
        <SettingsPanel settings={settings} onClose={() => setSettingsOpen(false)} />
      )}

      {rostering && (
        <RosterPanel
          roster={roster}
          onChange={setRoster}
          onClose={() => setRostering(false)}
        />
      )}

      {exporting && (
        <ExportPanel
          plays={matches}
          sections={sections}
          roster={roster}
          onJson={onExport}
          onRestore={onRestore}
          onClose={() => setExporting(false)}
        />
      )}

      {plays.length === 0 && sections.length === 0 ? (
        <p className="empty">
          Nothing here yet. Start a play and it saves itself as you draw.
        </p>
      ) : grouped.length === 0 ? (
        <p className="empty">No play matches “{query}”.</p>
      ) : (
        grouped.map(({ section, plays: inSection }) => (
          <section key={section.id}>
            <h2>
              {section.name} <span>{inSection.length}</span>
              {/* Unfiled is not a real folder, so it has nothing to rename. */}
              {section.id !== UNFILED_SECTION && (
                <span className="section-tools">
                  <button className="quiet" onClick={() => void renameSection(section)}>
                    Rename
                  </button>
                  <button
                    className="quiet danger"
                    onClick={() => void deleteSection(section, inSection.length)}
                  >
                    Delete
                  </button>
                </span>
              )}
            </h2>
            {inSection.length === 0 ? (
              <p className="empty-folder">
                Empty. Put a play in it from the folder menu on its card.
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
                        onMovePlay(
                          dragging,
                          plays.findIndex((p) => p.id === play.id),
                        );
                        // Dropping a card into a folder files it there too,
                        // otherwise it lands in the middle of a list it is not
                        // a member of and jumps back on the next render.
                        onSetSection(dragging, section.id);
                      }
                      setDragging(null);
                    }}
                    className={dragging === play.id ? 'card-drag' : undefined}
                  >
                    <PlayCard
                      play={play}
                      sections={sections}
                      onOpen={onOpen}
                      onDuplicate={onDuplicate}
                      onDelete={onDelete}
                      onSetSection={onSetSection}
                      onFileInNew={fileInNew}
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
    </div>
  );
}
