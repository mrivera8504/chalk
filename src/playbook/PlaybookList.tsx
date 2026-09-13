import { useMemo, useState } from 'react';
import { ExportPanel } from '../export/ExportPanel';
import { AccountPanel } from './AccountPanel';
import { useInstallPrompt } from '../store/install';
import { UNFILED_SECTION, type Play, type Section } from '../domain/types';
import type { SyncState } from '../store/sync';
import { PlayCard } from './PlayCard';

interface Props {
  plays: Play[];
  sections: Section[];
  sync: SyncState;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onAddSection: (name: string) => Section;
  onRenameSection: (id: string, name: string) => void;
  onDeleteSection: (id: string) => void;
  onSetSection: (id: string, sectionId: string) => void;
  onMovePlay: (id: string, toIndex: number) => void;
  onExport: () => void;
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
  offline: 'this device only, offline',
  denied: 'this device only, cloud refused',
};

export function PlaybookList({
  plays,
  sections,
  sync,
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
  onSaveNow,
}: Props) {
  const [query, setQuery] = useState('');
  const [dragging, setDragging] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [account, setAccount] = useState(false);
  const install = useInstallPrompt();

  /** Name, suggested name, tags and notes all match, because coaches search by feel. */
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return plays;
    return plays.filter((p) =>
      [p.name, p.suggestedName ?? '', p.notes, p.coachingPoint, ...p.tags]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [plays, query]);

  const searching = query.trim().length > 0;

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

  function addSection() {
    const name = prompt('Folder name');
    if (name?.trim()) onAddSection(name.trim());
  }

  /** Make a folder and drop this play straight into it, in one prompt. */
  function fileInNew(playId: string) {
    const name = prompt('New folder name');
    if (!name?.trim()) return;
    onSetSection(playId, onAddSection(name.trim()).id);
  }

  function renameSection(s: Section) {
    const name = prompt('Rename folder', s.name);
    if (name?.trim()) onRenameSection(s.id, name.trim());
  }

  function deleteSection(s: Section, count: number) {
    const warning = count
      ? `Delete the folder "${s.name}"? The ${count} ${
          count === 1 ? 'play goes' : 'plays go'
        } back to Unfiled.`
      : `Delete the empty folder "${s.name}"?`;
    if (confirm(warning)) onDeleteSection(s.id);
  }

  return (
    <div className="playbook">
      <header>
        <h1>Playbook</h1>
        <span className="sync">{SYNC_LABEL[sync]}</span>
      </header>

      <div className="book-tools">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search plays, tags, notes"
          spellCheck={false}
          aria-label="Search"
        />
        <button onClick={onNew}>New play</button>
        <button className="quiet" onClick={addSection}>
          Add folder
        </button>
        {plays.length > 0 && (
          <button
            className="quiet"
            onClick={() => {
              setAccount(false);
              setExporting((v) => !v);
            }}
            aria-pressed={exporting}
          >
            Export
          </button>
        )}
        <button
          className="quiet"
          onClick={() => {
            setExporting(false);
            setAccount((v) => !v);
          }}
          aria-pressed={account}
        >
          Account
        </button>
        {/* Only there when the browser has actually offered; see useInstallPrompt. */}
        {install && (
          <button className="quiet" onClick={install}>
            Install
          </button>
        )}
      </div>

      {account && <AccountPanel onSaveNow={onSaveNow} onClose={() => setAccount(false)} />}

      {exporting && (
        <ExportPanel
          plays={matches}
          sections={sections}
          onJson={onExport}
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
                  <button className="quiet" onClick={() => renameSection(section)}>
                    Rename
                  </button>
                  <button
                    className="quiet"
                    onClick={() => deleteSection(section, inSection.length)}
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
    </div>
  );
}
