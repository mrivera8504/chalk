import { useMemo, useState } from 'react';
import type { RosterEntry } from '../domain/roster';
import type { Play, Section } from '../domain/types';
import {
  layout,
  DEFAULT_PRINT,
  type NameSize,
  type Orientation,
  type PerPage,
  type PrintOptions,
} from './paper';
import { playSheetPdf } from './pdf';
import { download, playToSvg, stamp } from './render';
import { viewForPlays } from './view';

interface Props {
  plays: Play[];
  sections: Section[];
  roster: RosterEntry[];
  /**
   * Present when this is a screen of its own, absent when it is a layer inside
   * the editor's drawer — which already carries a title, a back arrow and a
   * Hide button. Same bargain the settings panel strikes, and for the reason
   * given in *Chrome, controls and dialogs*: two headers stacked up meant two
   * dismiss buttons that did different things.
   */
  onClose?: () => void;
}

/**
 * One page, drawn in the browser exactly where the PDF will draw it.
 *
 * Positioned in **percentages** of the page rather than in pixels, and lettered
 * in container units, so the same markup is a thumbnail in the panel and a
 * full-screen proof without measuring anything or re-rendering on resize. The
 * numbers all come from `layout()`, which is the same call `pdf.ts` makes — the
 * preview cannot drift from the sheet because there is nothing for it to drift
 * from.
 */
function PagePreview({
  plays,
  opts,
  meta,
  full,
}: {
  plays: Play[];
  opts: PrintOptions;
  meta: { title: string; folder?: string; page: number; of: number };
  /** Filling the view rather than sitting in the panel. */
  full?: boolean;
}) {
  const L = useMemo(() => layout(opts), [opts]);
  const pct = (n: number, of: number) => `${(n / of) * 100}%`;

  // Shaped to the cell, so landscape trims the depth nobody runs into rather
  // than padding the margins. One window per page, matching what `pdf.ts` does.
  const board = L.cells[0].board;
  const view = useMemo(
    () => viewForPlays(plays, board.w / board.h),
    [plays, board.w, board.h],
  );

  /*
   * Each board as an `<img>`, not as inline SVG.
   *
   * It has to be an image. An exported board carries its own `<style>` block
   * because a serialized SVG has no stylesheet to inherit, and that block sets
   * the print palette on `:root` — which, the moment the SVG is inlined into
   * this document, is *this document's* root. Dropping three of them into the
   * playbook turned every thumbnail on the page white, turf and all.
   *
   * A data URL is its own document, so nothing escapes it, and it is the same
   * path `svgToPng` takes on the way to the PDF: what is previewed here is
   * rendered by the same engine that will rasterize the sheet.
   *
   * The render itself is the expensive part — every player, route and zone
   * through react-dom/server — so it is keyed on the plays on this page and on
   * the options that change what is drawn. Turning the paper sideways moves
   * boxes around and does not redraw a thing.
   */
  const boards = useMemo(
    () =>
      plays.map(
        (p) =>
          `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
            playToSvg(p, {
              showHoles: opts.showHoles,
              showDefense: opts.showDefense,
              showGaps: opts.showGaps,
              forPrint: true,
              view,
            }),
          )}`,
      ),
    [plays, view, opts.showHoles, opts.showDefense, opts.showGaps],
  );

  return (
    <div
      className="print-page"
      style={{
        aspectRatio: `${L.page.w} / ${L.page.h}`,
        /*
         * Full screen, the sheet is whichever of the two limits bites first.
         *
         * It cannot be done in the stylesheet, because the answer depends on
         * the page's own proportions and those change when the paper is turned.
         * A height of `100%` inside a wrapper that is itself sized by its
         * content is circular, and collapsed the sheet to nothing; this asks
         * for the width directly — the room across, or the room down times the
         * page's aspect, whichever is smaller. `dvh` rather than `vh` so the
         * phone's address bar sliding away does not crop it.
         */
        ...(full
          ? { width: `min(100%, calc((100dvh - 132px) * ${L.page.w / L.page.h}))` }
          : null),
      }}
      aria-label={`Page ${meta.page} of ${meta.of}`}
    >
      {L.head && (
        <div
          className="print-head"
          style={{
            left: pct(L.head.x, L.page.w),
            top: pct(L.head.top, L.page.h),
            width: pct(L.head.w, L.page.w),
            height: pct(L.head.h, L.page.h),
            fontSize: `${(13 / L.page.w) * 100}cqw`,
          }}
        >
          <strong>{meta.folder ?? meta.title}</strong>
          {meta.of > 1 && (
            <span>
              {meta.page} / {meta.of}
            </span>
          )}
        </div>
      )}

      {plays.map((play, n) => {
        const cell = L.cells[n];
        if (!cell) return null;
        return (
          <div key={play.id}>
            <div
              className="print-name"
              style={{
                left: pct(cell.name.x, L.page.w),
                top: pct(cell.name.top, L.page.h),
                width: pct(cell.name.w, L.page.w),
                height: pct(cell.name.h, L.page.h),
                fontSize: `${(cell.nameSize / L.page.w) * 100}cqw`,
              }}
            >
              <span>{play.name || play.suggestedName || 'Untitled'}</span>
            </div>
            <img
              className="print-board"
              src={boards[n]}
              alt=""
              style={{
                left: pct(cell.board.x, L.page.w),
                top: pct(cell.board.top, L.page.h),
                width: pct(cell.board.w, L.page.w),
                height: pct(cell.board.h, L.page.h),
              }}
            />
          </div>
        );
      })}

      {L.notes && plays[0] && (
        <div
          className="print-notes"
          style={{
            left: pct(L.notes.x, L.page.w),
            top: pct(L.notes.top, L.page.h),
            width: pct(L.notes.w, L.page.w),
            height: pct(L.notes.h, L.page.h),
            fontSize: `${(10 / L.page.w) * 100}cqw`,
          }}
        >
          {[plays[0].coachingPoint, plays[0].notes, plays[0].tags.join(' · ')]
            .filter(Boolean)
            .slice(0, 3)
            .map((line, i) => (
              <div key={i}>{line}</div>
            ))}
        </div>
      )}
    </div>
  );
}

/**
 * Everything about putting plays on paper, in one screen.
 *
 * It replaced seven fixed buttons — 4, 6 and 9 up, big-print cards, the full
 * playbook — each of which was a layout nobody could adjust and none of which
 * could be turned sideways. They were all the same sheet with different
 * numbers in it, so this is those numbers, with the sheet shown underneath
 * while they are changed.
 */
export function PrintPanel({ plays, sections, roster, onClose }: Props) {
  const [opts, setOpts] = useState<PrintOptions>(DEFAULT_PRINT);
  const [byFolder, setByFolder] = useState(true);
  const [page, setPage] = useState(0);
  const [full, setFull] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const set = <K extends keyof PrintOptions>(key: K, value: PrintOptions[K]) => {
    setOpts((o) => ({ ...o, [key]: value }));
    setPage(0);
  };

  /** Folder order, and the folder name for the running head. */
  const { ordered, folderOf } = useMemo(() => {
    const order = [...sections].sort((a, b) => a.order - b.order);
    const name = new Map(order.map((s) => [s.id, s.name]));
    const folder = (p: Play) => name.get(p.sectionId) ?? 'Unfiled';
    if (!byFolder) return { ordered: plays, folderOf: undefined };
    return {
      ordered: [
        ...order.flatMap((s) => plays.filter((p) => p.sectionId === s.id)),
        ...plays.filter((p) => !name.has(p.sectionId)),
      ],
      folderOf: folder,
    };
  }, [plays, sections, byFolder]);

  const total = Math.max(1, Math.ceil(ordered.length / opts.perPage));
  const at = Math.min(page, total - 1);
  const onThisPage = ordered.slice(at * opts.perPage, (at + 1) * opts.perPage);

  async function save() {
    if (busy) return;
    setBusy(true);
    setFailed(null);
    try {
      const bytes = await playSheetPdf(ordered, opts, {
        title: 'Chalk',
        roster,
        folderOf,
      });
      const shape = opts.perPage === 1 ? 'plays' : `${opts.perPage}up`;
      download(bytes, `chalk-${shape}-${stamp()}.pdf`, 'application/pdf');
    } catch (err) {
      setFailed(err instanceof Error ? err.message : 'The sheet did not finish.');
    } finally {
      setBusy(false);
    }
  }

  const preview = (full: boolean) => (
    <PagePreview
      full={full}
      plays={onThisPage}
      opts={opts}
      meta={{
        title: 'Chalk',
        folder: onThisPage[0] && folderOf ? folderOf(onThisPage[0]) : undefined,
        page: at + 1,
        of: total,
      }}
    />
  );

  const pager = total > 1 && (
    <div className="print-pager">
      <button className="quiet" disabled={at === 0} onClick={() => setPage(at - 1)}>
        ‹
      </button>
      <span>
        Page {at + 1} of {total}
      </span>
      <button className="quiet" disabled={at >= total - 1} onClick={() => setPage(at + 1)}>
        ›
      </button>
    </div>
  );

  const toggle = (on: boolean, label: string, hit: () => void) => (
    <button aria-pressed={on} onClick={hit}>
      {label}
    </button>
  );

  // One play has no grid to lay out and no folders to sort by. Both controls
  // would be live and do nothing, which is worse than their absence.
  const many = ordered.length > 1;

  return (
    <div className={`picker print-panel${onClose ? ' standalone' : ''}`}>
      {onClose && (
        <div className="picker-head">
          <strong>Print</strong>
          <span>
            {ordered.length} {ordered.length === 1 ? 'play' : 'plays'} · {total}{' '}
            {total === 1 ? 'page' : 'pages'}
          </span>
          <button className="quiet" onClick={onClose}>
            Close
          </button>
        </div>
      )}

      <div className="picker-group">
        <h3>Paper</h3>
        <div className="picker-row">
          {(['portrait', 'landscape'] as const).map((o: Orientation) => (
            <button
              key={o}
              aria-pressed={opts.orientation === o}
              onClick={() => set('orientation', o)}
            >
              {o === 'portrait' ? 'Portrait' : 'Landscape'}
            </button>
          ))}
          {toggle(opts.edgeToEdge, 'Fill the page', () => set('edgeToEdge', !opts.edgeToEdge))}
        </div>
        <p className="picker-note">
          Filling the page drops the binder margin and runs the play out to the
          edge of what a printer can reach.
        </p>
      </div>

      {many && (
        <div className="picker-group">
          <h3>Per page</h3>
          <div className="picker-row">
            {([1, 2, 4, 6, 9] as const).map((n: PerPage) => (
              <button key={n} aria-pressed={opts.perPage === n} onClick={() => set('perPage', n)}>
                {n}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="picker-group">
        <h3>Name</h3>
        <div className="picker-row">
          {(
            [
              ['normal', 'Normal'],
              ['big', 'Big'],
              ['huge', 'Huge'],
            ] as [NameSize, string][]
          ).map(([v, label]) => (
            <button key={v} aria-pressed={opts.nameSize === v} onClick={() => set('nameSize', v)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="picker-group">
        <h3>Show</h3>
        <div className="picker-row">
          {toggle(!!opts.showHoles, 'Holes', () => set('showHoles', !opts.showHoles))}
          {toggle(!!opts.showGaps, 'Gaps', () => set('showGaps', !opts.showGaps))}
          {toggle(!!opts.showDefense, 'Defense', () => set('showDefense', !opts.showDefense))}
          {toggle(opts.showNotes, 'Notes', () => set('showNotes', !opts.showNotes))}
          {many &&
            toggle(byFolder, 'Folder order', () => {
              setByFolder(!byFolder);
              setPage(0);
            })}
        </div>
        {opts.showNotes && opts.perPage > 1 && (
          <p className="picker-note">
            Notes only fit one play to a page. They come back at 1 per page.
          </p>
        )}
      </div>

      <div className="picker-group">
        <h3>Preview</h3>
        <div className="print-preview">{preview(false)}</div>
        {pager}
        <div className="picker-row">
          <button onClick={() => setFull(true)}>Full screen</button>
          <button className="primary" disabled={busy || !ordered.length} onClick={() => void save()}>
            {busy ? 'Drawing…' : 'Save PDF'}
          </button>
        </div>
      </div>

      {failed && <p className="picker-note bad">{failed}</p>}
      {busy && (
        <p className="picker-note">
          Drawing every play at print resolution. A big playbook takes a moment.
        </p>
      )}

      {full && (
        <div className="print-full" onClick={() => setFull(false)}>
          <div className="print-full-sheet" onClick={(e) => e.stopPropagation()}>
            {preview(true)}
          </div>
          <div className="print-full-bar" onClick={(e) => e.stopPropagation()}>
            {pager}
            <button
              className="primary"
              disabled={busy || !ordered.length}
              onClick={() => void save()}
            >
              {busy ? 'Drawing…' : 'Save PDF'}
            </button>
            <button className="quiet" onClick={() => setFull(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
