import { useMemo, useState } from 'react';
import { UNFILED_SECTION, type Play, type Section } from '../domain/types';
import { viewForPlays } from '../export/view';
import { PlayPicture } from '../render/PlayPicture';
import { boardVars } from '../store/settings';
import { useBackLayer } from '../ui/backstack';
import { Icon } from '../ui/Icon';
import { PlayStudy } from './PlayStudy';

interface Props {
  plays: Play[];
  sections: Section[];
  onExit: () => void;
}

/**
 * The playbook on the sideline: a call sheet on the screen, nothing on it that
 * edits anything.
 *
 * Big targets, because it is used with a cold thumb and one eye on the field.
 * No menus, no drawer, no pencil — the worst thing a mis-tap can do here is
 * open the wrong play. When some plays are marked game-ready, those are the
 * sheet; until any are, it is every play, because a sheet that opens empty on
 * a Friday night is a sheet nobody trusts twice.
 */
export function GameDay({ plays, sections, onExit }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  const marked = plays.some((p) => p.status === 'ready');
  const list = useMemo(
    () => (marked && !all ? plays.filter((p) => p.status === 'ready') : plays),
    [plays, marked, all],
  );

  // The back gesture closes the play first, then leaves game day.
  useBackLayer(open !== null, () => setOpen(null));

  /** Folder by folder, in the playbook's own order: how a call sheet is laid out. */
  const groups = useMemo(() => {
    const order = [...sections].sort((a, b) => a.order - b.order);
    const named = order
      .map((s) => ({ name: s.name, plays: list.filter((p) => p.sectionId === s.id) }))
      .filter((g) => g.plays.length);
    const loose = list.filter((p) => !sections.some((s) => s.id === p.sectionId) || p.sectionId === UNFILED_SECTION);
    return loose.length ? [...named, { name: 'Unfiled', plays: loose }] : named;
  }, [list, sections]);

  const play = open === null ? null : list[open];
  const title = (p: Play) => p.name || p.suggestedName || 'Untitled';

  return (
    <div className="shared gameday">
      <header className="shared-head">
        {play ? (
          <button className="quiet with-icon" onClick={() => setOpen(null)} aria-label="Back to the sheet">
            <Icon name="back" />
          </button>
        ) : null}
        <div className="shared-title">
          <strong>{play ? title(play) : 'Game day'}</strong>
          <span>{play ? `${(open ?? 0) + 1} of ${list.length}` : `${list.length} plays`}</span>
        </div>
        {!play && marked && (
          <button aria-pressed={all} onClick={() => setAll((v) => !v)}>
            {all ? 'Game-ready only' : 'Every play'}
          </button>
        )}
        <button onClick={onExit}>Done</button>
      </header>

      {play ? (
        <PlayStudy
          key={play.id}
          play={play}
          onNext={list.length > 1 ? () => setOpen(((open ?? 0) + 1) % list.length) : undefined}
        />
      ) : list.length === 0 ? (
        <p className="shared-empty">No plays in this playbook yet.</p>
      ) : (
        groups.map((g) => (
          <section key={g.name} className="gameday-group">
            <h2>{g.name}</h2>
            <div className="shared-list">
              {g.plays.map((p) => (
                <button key={p.id} className="shared-card" onClick={() => setOpen(list.indexOf(p))}>
                  <span className="shared-thumb" style={boardVars(p.surface ?? 'grass')}>
                    <PlayPicture play={p} view={viewForPlays([p], 4 / 3)} showDefense />
                  </span>
                  <strong>{title(p)}</strong>
                </button>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
