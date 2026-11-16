import { useEffect, useState } from 'react';
import type { Play } from '../domain/types';
import type { Version } from '../store/sync';
import { toast } from '../ui/toast';

interface Props {
  /** Every play the book holds now, live or in the trash, by id. */
  have: Set<string>;
  load: () => Promise<{ purged: { play: Play; purgedAt: number }[]; versions: Version[] }>;
  onBringBack: (plays: Play[]) => void;
}

const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const title = (p: Play) => p.name || p.suggestedName || 'Untitled play';

/**
 * What the cloud remembers of the whole playbook.
 *
 * Two lists. Plays emptied from the trash, each kept as a last copy when it
 * went, which a coach can put back one at a time. And the earlier copies of
 * the whole book the old single-document sync kept, from before the move to
 * one document per play: from one of those, the plays the book no longer has
 * can be brought back.
 *
 * Bringing back only ever adds a play that is missing. Nothing here replaces
 * a play that is still in the book, so no copy, however old, can roll newer
 * work back. Replacing the whole book is what a backup file is for.
 */
export function BookHistoryPanel({ have, load, onBringBack }: Props) {
  const [got, setGot] = useState<Awaited<ReturnType<Props['load']>> | null>(null);

  useEffect(() => {
    let alive = true;
    void load().then((h) => alive && setGot(h));
    return () => {
      alive = false;
    };
  }, [load]);

  if (!got) return <p className="picker-note">Asking the cloud…</p>;
  const purged = got.purged.filter((x) => !have.has(x.play.id));
  const versions = got.versions
    .map((v) => ({ v, missing: v.book.plays.filter((p) => !p.deletedAt && !have.has(p.id)) }))
    .filter((x) => x.missing.length);

  return (
    <div className="picker book-history">
      <div className="picker-group">
        <h3>Emptied from the trash</h3>
        {purged.length === 0 ? (
          <p className="picker-note">Nothing emptied from the trash is missing.</p>
        ) : (
          <ul className="coach-list">
            {purged.map(({ play, purgedAt }) => (
              <li key={play.id} className="coach-row">
                <span className="coach-name">
                  {title(play)}
                  <span className="coach-role">{when(purgedAt)}</span>
                </span>
                <button
                  className="quiet"
                  onClick={() => {
                    onBringBack([play]);
                    toast(`Put back ${title(play)}`);
                  }}
                >
                  Put back
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {versions.length > 0 && (
        <div className="picker-group">
          <h3>Earlier copies of the playbook</h3>
          <ul className="coach-list">
            {versions.map(({ v, missing }) => (
              <li key={v.id} className="coach-row">
                <span className="coach-name">
                  {when(v.savedAt)}
                  <span className="coach-role">
                    {missing.length} {missing.length === 1 ? 'play' : 'plays'} not in it now
                  </span>
                </span>
                <button
                  className="quiet"
                  onClick={() => {
                    onBringBack(missing);
                    toast(`Brought back ${missing.length} ${missing.length === 1 ? 'play' : 'plays'}`);
                  }}
                >
                  Bring back
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
