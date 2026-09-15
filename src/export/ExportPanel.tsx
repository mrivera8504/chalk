import { useRef, useState } from 'react';
import { askConfirm } from '../ui/dialog';
import type { RosterEntry } from '../domain/roster';
import type { Play, Section } from '../domain/types';
import { callSheetPdf, playbookPdf, playerCardsPdf, rosterPdf, wristbandPdf } from './pdf';
import { download, stamp } from './render';

interface Props {
  plays: Play[];
  sections: Section[];
  roster: RosterEntry[];
  /** Write the backup file. Everything in local storage, not only the plays. */
  onJson: () => void;
  /** Read one back. Throws with something readable when the file is not one. */
  onRestore: (text: string) => void;
  onClose: () => void;
}

type Job = 'book' | 'call4' | 'call6' | 'call9' | 'band' | 'cards' | 'roster' | null;

/**
 * Everything that leaves the app as a file.
 *
 * Each button is one job, and only one runs at a time: a full playbook
 * rasterizes every play at print resolution, which on a phone takes long enough
 * that a second tap on a different button would have two of them competing for
 * the same canvas.
 */
export function ExportPanel({ plays, sections, roster, onJson, onRestore, onClose }: Props) {
  const [busy, setBusy] = useState<Job>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [restored, setRestored] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  /**
   * Restore, behind a confirm and a reload.
   *
   * A backup replaces the playbook rather than merging into it, so this is the
   * one destructive button in the app and it says so before it runs. The reload
   * afterwards is not laziness: the formations, saved routes, roster and
   * settings are all read into state when their screens mount, and a restore
   * that left half the app showing the old copy would be its own kind of data
   * loss.
   */
  async function restore(chosen: File) {
    setFailed(null);
    setRestored(null);
    try {
      const text = await chosen.text();
      const ok = await askConfirm(`Restore from ${chosen.name}?`, {
        body:
          'Everything on this device — plays, folders, formations, saved routes, ' +
          'the roster and your settings — is replaced by what is in that file.',
        confirmLabel: 'Replace everything',
        danger: true,
      });
      if (!ok) return;
      onRestore(text);
      setRestored('Restored. Reloading…');
      window.setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      setFailed(err instanceof Error ? err.message : 'That file could not be read.');
    } finally {
      // Or choosing the same file twice in a row fires no change event.
      if (file.current) file.current.value = '';
    }
  }

  async function run(job: Exclude<Job, null>, make: () => Promise<Uint8Array>, name: string) {
    if (busy) return;
    setBusy(job);
    setFailed(null);
    try {
      download(await make(), name, 'application/pdf');
    } catch (err) {
      // Says what went wrong rather than leaving a button that did nothing.
      setFailed(err instanceof Error ? err.message : 'The export did not finish.');
    } finally {
      setBusy(null);
    }
  }

  const label = (job: Job, text: string) => (busy === job ? 'Working…' : text);
  const day = stamp();
  const callJob = (n: 4 | 6 | 9): Exclude<Job, null> =>
    n === 4 ? 'call4' : n === 6 ? 'call6' : 'call9';

  return (
    <div className="picker export-panel">
      <div className="picker-head">
        <strong>Export</strong>
        <span>
          {plays.length} {plays.length === 1 ? 'play' : 'plays'}
        </span>
        <button className="quiet" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="picker-group">
        <h3>Call sheet</h3>
        <div className="picker-row">
          {([4, 6, 9] as const).map((n) => (
            <button
              key={n}
              disabled={busy !== null}
              onClick={() =>
                void run(
                  callJob(n),
                  () => callSheetPdf(plays, n, 'Call sheet'),
                  `chalk-call-sheet-${n}up-${day}.pdf`,
                )
              }
            >
              {label(callJob(n), `${n} per page`)}
            </button>
          ))}
        </div>
      </div>

      <div className="picker-group">
        <h3>For the team</h3>
        <div className="picker-row">
          <button
            disabled={busy !== null}
            onClick={() =>
              void run(
                'band',
                () => wristbandPdf(plays, 'Chalk'),
                `chalk-wristband-${day}.pdf`,
              )
            }
          >
            {label('band', 'Wristband strips')}
          </button>
          <button
            disabled={busy !== null}
            onClick={() =>
              void run('cards', () => playerCardsPdf(plays), `chalk-player-cards-${day}.pdf`)
            }
          >
            {label('cards', 'Big-print cards')}
          </button>
        </div>
      </div>

      <div className="picker-group">
        <h3>Everything</h3>
        <div className="picker-row">
          <button
            disabled={busy !== null}
            onClick={() =>
              void run(
                'book',
                () => playbookPdf(plays, sections, { showHoles: true }),
                `chalk-playbook-${day}.pdf`,
              )
            }
          >
            {label('book', 'Full playbook PDF')}
          </button>
          <button
            disabled={busy !== null || !roster.length}
            onClick={() => void run('roster', () => rosterPdf(roster), `chalk-roster-${day}.pdf`)}
          >
            {label('roster', 'Team sheet')}
          </button>
        </div>
      </div>

      <div className="picker-group">
        <h3>Backup</h3>
        <div className="picker-row">
          <button onClick={onJson}>Save a backup</button>
          <button className="quiet" onClick={() => file.current?.click()}>
            Restore from a file
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const chosen = e.target.files?.[0];
              if (chosen) void restore(chosen);
            }}
          />
        </div>
        <p className="picker-note">
          The backup carries the plays, the folders, your formations, the routes
          you saved, the roster and your settings. Restoring replaces all of it.
        </p>
      </div>

      {failed && <p className="picker-note bad">{failed}</p>}
      {restored && <p className="picker-note">{restored}</p>}
      {busy && (
        <p className="picker-note">
          Drawing every play at print resolution. A big playbook takes a moment.
        </p>
      )}
    </div>
  );
}
