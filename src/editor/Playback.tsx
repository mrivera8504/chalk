import { useEffect, useMemo, useState } from 'react';
import type { Frame } from '../domain/frames';
import { playbackLength, poseAt } from '../domain/playback';
import { refreshPaths } from '../domain/regenerate';
import type { PlayerSlot } from '../domain/types';
import { AssignmentPath } from '../render/AssignmentPath';
import { Field } from '../render/Field';
import type { Surface } from '../sports';
import { PlayerShape } from '../render/PlayerShape';

interface Props {
  frames: Frame[];
  viewBox: string;
  /** The board's own alignment, so a running play lands on the marks it started from. */
  align?: string;
  surface: Surface;
  fieldView: { x: number; y: number; w: number; h: number };
  /** Whether a man is on the board at all: a hidden side stays hidden. */
  shows: (p: PlayerSlot) => boolean;
  onStep: (step: number) => void;
  onDone: () => void;
}

/**
 * The play, running, over the board.
 *
 * Its own layer with its own clock. The editor is two thousand lines and
 * re-rendering it sixty times a second to move eleven marks would be paying
 * for the whole screen to animate a corner of it; this redraws only itself,
 * and the editor hears about it twice — which step is showing, and that it
 * has finished.
 *
 * Inert, like everything else drawn on the board: the stage underneath still
 * takes the pointer, and a tap anywhere stops the play.
 */
export function Playback({ frames: stored, viewBox, align = 'xMidYMid meet', surface, fieldView, shows, onStep, onDone }: Props) {
  const [ms, setMs] = useState(0);
  /*
   * Every line rebuilt from its men, once, before anybody moves along one. A
   * screen is stored as who-for-whom and its saved path is only as fresh as
   * the last time the board drew it.
   */
  const frames = useMemo(
    () => stored.map((f) => ({ ...f, assignments: refreshPaths(f.assignments, f.players) })),
    [stored],
  );
  const total = playbackLength(frames);

  useEffect(() => {
    let raf = 0;
    const began = performance.now();
    const tick = (now: number) => {
      const at = now - began;
      setMs(Math.min(at, total));
      if (at >= total) onDone();
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // One run per mount: the editor mounts this to play and unmounts it to stop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pose = poseAt(frames, ms);
  useEffect(() => onStep(pose.step), [pose.step]); // eslint-disable-line react-hooks/exhaustive-deps

  const frame = frames[pose.step];
  const lines = frame.assignments.filter((a) => {
    const who = frame.players.find((p) => p.id === a.playerId);
    return who ? shows(who) : false;
  });

  return (
    <svg className="playback" viewBox={viewBox} preserveAspectRatio={align} aria-hidden="true">
      <Field holes={[]} showHoles={false} view={fieldView} surface={surface} />
      {/* The lines stay, faint: what is being run is still what was drawn. */}
      <g opacity={0.3}>
        {lines.map((a) => (
          <AssignmentPath key={a.id} assignment={a} />
        ))}
      </g>
      {pose.players.filter(shows).map((p) => (
        <PlayerShape
          key={p.id}
          player={p}
          selected={false}
          ball={p.id === pose.holder}
          ballMark={surface === 'field' ? 'star' : 'ball'}
        />
      ))}
      {pose.ball && (
        <circle
          cx={pose.ball.x}
          cy={pose.ball.y}
          r={0.36}
          fill="var(--ball)"
          stroke="var(--ball-line)"
          strokeWidth={0.07}
        />
      )}
    </svg>
  );
}
