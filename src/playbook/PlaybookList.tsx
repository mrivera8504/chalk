import { useMemo, useState } from 'react';
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
  onAddSection: (name: string) => void;
  onMovePlay: (id: string, toIndex: number) => void;
  onExport: () => void;
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
  onMovePlay,
  onExport,
}: Props) {
  const [query, setQuery] = useState('');
  const [dragging, setDragging] = useState<string | null>(null);

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
    return buckets.filter((b) => b.plays.length > 0);
  }, [matches, sections]);

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
        <button
          className="quiet"
          onClick={() => {
            const name = prompt('Section name');
            if (name?.trim()) onAddSection(name.trim());
          }}
        >
          Add section
        </button>
        {plays.length > 0 && (
          <button className="quiet" onClick={onExport}>
            Export
          </button>
        )}
      </div>

      {plays.length === 0 ? (
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
            </h2>
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
                    }
                    setDragging(null);
                  }}
                  className={dragging === play.id ? 'card-drag' : undefined}
                >
                  <PlayCard
                    play={play}
                    onOpen={onOpen}
                    onDuplicate={onDuplicate}
                    onDelete={onDelete}
                  />
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
