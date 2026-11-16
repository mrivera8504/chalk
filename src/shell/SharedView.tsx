import { useEffect, useMemo, useState } from 'react';
import { framesOf } from '../domain/frames';
import type { Play } from '../domain/types';
import { Playback } from '../editor/Playback';
import { boardView, viewBox, viewForPlays } from '../export/view';
import { PlayPicture } from '../render/PlayPicture';
import { surfaceOf } from '../sports';
import { boardVars } from '../store/settings';
import { handOver, readShare, type Shared } from '../store/share';
import { Icon } from '../ui/Icon';

interface Props {
  token: string;
}

/**
 * A play, or a playbook, opened from a link.
 *
 * Read-only, and runs without the playbook loaded at all: no account is made
 * and nothing is synced just because a player tapped a link in a group chat.
 * The one way in to the coach's side of the app is Save a copy, which hands
 * the plays over and lets the app start as it always does.
 */
export function SharedView({ token }: Props) {
  const [state, setState] = useState<
    { kind: 'loading' } | { kind: 'gone' } | { kind: 'offline' } | { kind: 'ready'; shared: Shared }
  >({ kind: 'loading' });
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    void readShare(token).then((r) => {
      if (!alive) return;
      if (r.ok) {
        setState({ kind: 'ready', shared: r.shared });
        // A link to one play opens on it; a playbook opens on its list.
        if (r.shared.plays.length === 1) setOpen(0);
      } else setState({ kind: r.reason });
    });
    return () => {
      alive = false;
    };
  }, [token]);

  if (state.kind !== 'ready') {
    return (
      <div className="shared">
        <header className="shared-head">
          <strong>Chalk</strong>
        </header>
        <p className="shared-empty">
          {state.kind === 'loading'
            ? 'Opening…'
            : state.kind === 'gone'
              ? 'This link is no longer shared. Ask your coach for a new one.'
              : 'No connection. This link needs a signal the first time it opens.'}
        </p>
      </div>
    );
  }

  const { shared } = state;
  const play = open === null ? null : shared.plays[open];

  const copy = () => {
    handOver(play ? [play] : shared.plays);
    location.assign('/');
  };

  return (
    <div className="shared">
      <header className="shared-head">
        {play && shared.plays.length > 1 ? (
          <button className="quiet with-icon" onClick={() => setOpen(null)} aria-label="Back to the list">
            <Icon name="back" />
          </button>
        ) : null}
        <div className="shared-title">
          <strong>{play ? play.name || play.suggestedName || 'Untitled' : shared.title}</strong>
          <span>Shared from Chalk</span>
        </div>
        <button onClick={copy}>{play ? 'Save a copy' : 'Save all'}</button>
      </header>

      {play ? (
        <SharedPlay play={play} />
      ) : (
        <div className="shared-list">
          {shared.plays.map((p, i) => (
            <button key={p.id} className="shared-card" onClick={() => setOpen(i)}>
              <span className="shared-thumb" style={boardVars(p.surface ?? 'grass')}>
                <PlayPicture play={p} view={viewForPlays([p], 4 / 3)} showDefense />
              </span>
              <strong>{p.name || p.suggestedName || 'Untitled'}</strong>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** One play: its steps, a button that runs it, and its notes underneath. */
function SharedPlay({ play }: { play: Play }) {
  const steps = useMemo(() => framesOf(play), [play]);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const view = boardView(play);
  const f = steps[step];
  const shown: Play = {
    ...play,
    players: f.players,
    assignments: f.assignments,
    annotations: f.annotations,
    ballCarrierId: f.ballCarrierId,
  };

  return (
    <>
      <div className="shared-board" style={boardVars(play.surface ?? 'grass')}>
        {playing ? (
          <Playback
            frames={steps}
            viewBox={viewBox(view)}
            surface={surfaceOf(play.variant)}
            fieldView={view}
            shows={(p) => (p.side === 'defense' ? !play.hideDefense : !play.hideOffense)}
            onStep={setStep}
            onDone={() => setPlaying(false)}
          />
        ) : (
          <PlayPicture play={shown} view={view} showDefense />
        )}
      </div>
      <div className="shared-controls">
        <button
          aria-label={playing ? 'Stop' : 'Run the play'}
          aria-pressed={playing}
          onClick={() => {
            setStep(0);
            setPlaying((v) => !v);
          }}
        >
          <Icon name={playing ? 'stop' : 'play'} />
        </button>
        {steps.length > 1 &&
          steps.map((_, i) => (
            <button
              key={i}
              aria-label={`Step ${i + 1}`}
              aria-pressed={i === step}
              disabled={playing}
              onClick={() => setStep(i)}
            >
              {i + 1}
            </button>
          ))}
      </div>
      {(play.coachingPoint || play.notes) && (
        <div className="shared-notes">
          {play.coachingPoint && <p className="point">{play.coachingPoint}</p>}
          {play.notes && <p>{play.notes}</p>}
        </div>
      )}
    </>
  );
}
