import { useMemo, useState } from 'react';
import { framesOf } from '../domain/frames';
import type { Play } from '../domain/types';
import { Playback } from '../editor/Playback';
import { boardView, viewBox } from '../export/view';
import { PlayPicture } from '../render/PlayPicture';
import { surfaceOf } from '../sports';
import { boardVars } from '../store/settings';
import { Icon } from '../ui/Icon';

interface Props {
  play: Play;
  /** For a run of plays: the next card, which a quiz is mostly made of. */
  onNext?: () => void;
}

/**
 * One play, to be read rather than drawn: its steps, a button that runs it,
 * the coaching point — and a way for a player to find his own job in it.
 *
 * Pick a position and every other line fades back, which is "show me only my
 * job". Quiz hides his line instead and asks; Show puts it back. Both are only
 * ever about the board in front of the player, never stored, and the play is
 * never touched — this is used by the shared link and by game day, and nothing
 * in either is editable.
 */
export function PlayStudy({ play, onNext }: Props) {
  const steps = useMemo(() => framesOf(play), [play]);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [who, setWho] = useState<string | null>(null);
  const [quiz, setQuiz] = useState(false);
  const view = boardView(play);
  const f = steps[step];
  const shown: Play = {
    ...play,
    players: f.players,
    assignments: f.assignments,
    annotations: f.annotations,
    ballCarrierId: f.ballCarrierId,
  };

  /*
   * The men on the side this play is about: the offense of an offensive play,
   * the defense of a defensive one. A scout look is not anybody's job to learn
   * off this card.
   */
  const side = play.unit === 'defense' ? 'defense' : 'offense';
  const positions = play.players.filter((p) => p.side === side);
  const hasJob = (id: string) => steps.some((s) => s.assignments.some((a) => a.playerId === id));

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
          <PlayPicture
            play={shown}
            view={view}
            showDefense
            focus={who ? { playerId: who, quiz } : null}
          />
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
        {onNext && (
          <button className="next" onClick={onNext}>
            Next play
          </button>
        )}
      </div>

      {positions.length > 0 && (
        <div className="study">
          <div className="study-row" role="group" aria-label="My position">
            <span>I play</span>
            {positions.map((p) => (
              <button
                key={p.id}
                aria-pressed={who === p.id}
                disabled={!hasJob(p.id) && who !== p.id}
                onClick={() => {
                  setWho(who === p.id ? null : p.id);
                  setQuiz(false);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          {who && (
            <div className="study-row">
              {/* The question first, then the answer: that is the order a
                  flashcard is used in. */}
              <button aria-pressed={quiz} onClick={() => setQuiz((q) => !q)}>
                {quiz ? 'Show my job' : 'Quiz me'}
              </button>
            </div>
          )}
        </div>
      )}

      {(play.coachingPoint || play.notes) && (
        <div className="shared-notes">
          {play.coachingPoint && <p className="point">{play.coachingPoint}</p>}
          {play.notes && <p>{play.notes}</p>}
        </div>
      )}
    </>
  );
}
