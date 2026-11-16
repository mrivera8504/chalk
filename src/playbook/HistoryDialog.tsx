import { useEffect, useState } from 'react';
import type { Play } from '../domain/types';
import type { Revision } from '../store/cloud2';
import { useBackLayer } from '../ui/backstack';

interface Props {
  play: Play;
  load: (playId: string) => Promise<Revision[]>;
  onRestore: (play: Play) => void;
  onClose: () => void;
}

const when = (t: number) =>
  new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * The copies a play's saves have replaced, and the way back to one.
 *
 * The cloud has kept these since the sync was rebuilt, and there was no screen
 * for them: getting a play back meant a script. Restoring is itself a save, so
 * the copy on screen now becomes the newest revision — going back is never the
 * end of the line.
 */
export function HistoryDialog({ play, load, onRestore, onClose }: Props) {
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  useBackLayer(true, onClose);

  useEffect(() => {
    let alive = true;
    void load(play.id).then((r) => alive && setRevisions(r));
    return () => {
      alive = false;
    };
  }, [play.id, load]);

  const title = play.name || play.suggestedName || 'Untitled';

  return (
    <div className="dialog-scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog history" role="dialog" aria-modal="true" aria-label={`Earlier versions of ${title}`}>
        <strong>Earlier versions of {title}</strong>
        {revisions === null ? (
          <p className="dialog-body">Looking…</p>
        ) : revisions.length === 0 ? (
          <p className="dialog-body">None kept yet. One is kept each time a save replaces what is in the cloud.</p>
        ) : (
          <ul className="history-list">
            {revisions.map((r) => (
              <li key={r.savedAt}>
                <span>
                  {when(r.savedAt)}
                  <em>{r.play.name || r.play.suggestedName || 'Untitled'}</em>
                </span>
                <button
                  onClick={() => {
                    onRestore(r.play);
                    onClose();
                  }}
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="dialog-buttons">
          <button className="quiet" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
