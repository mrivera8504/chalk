import { useState } from 'react';
import type { Play, Section } from '../domain/types';
import { callSheetPdf, playbookPdf, playerCardsPdf, wristbandPdf } from './pdf';
import { download, stamp } from './render';

interface Props {
  plays: Play[];
  sections: Section[];
  /** The JSON backup, which predates this panel and stays exactly as it was. */
  onJson: () => void;
  onClose: () => void;
}

type Job = 'book' | 'call4' | 'call6' | 'call9' | 'band' | 'cards' | null;

/**
 * Everything that leaves the app as a file.
 *
 * Each button is one job, and only one runs at a time: a full playbook
 * rasterizes every play at print resolution, which on a phone takes long enough
 * that a second tap on a different button would have two of them competing for
 * the same canvas.
 */
export function ExportPanel({ plays, sections, onJson, onClose }: Props) {
  const [busy, setBusy] = useState<Job>(null);
  const [failed, setFailed] = useState<string | null>(null);

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
          <button className="quiet" onClick={onJson}>
            JSON backup
          </button>
        </div>
      </div>

      {failed && <p className="picker-note bad">{failed}</p>}
      {busy && (
        <p className="picker-note">
          Drawing every play at print resolution. A big playbook takes a moment.
        </p>
      )}
    </div>
  );
}
