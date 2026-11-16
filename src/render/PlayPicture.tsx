import { autoRouteColor } from '../domain/colors';
import { refreshPaths } from '../domain/regenerate';
import { drawnSides, quarterback, type Play } from '../domain/types';
import { viewBox, type View } from '../export/view';
import { isFootball, surfaceOf } from '../sports';
import { AssignmentPath } from './AssignmentPath';
import { BoardMarks } from './BoardMarks';
import { Field } from './Field';
import { FocusSquare } from './FocusSquare';
import { PlayerShape } from './PlayerShape';
import { VisionCone } from './VisionCone';
import { ZoneArea } from './Zone';
import { toPathD } from './geometry';

interface Props {
  play: Play;
  view: View;
  /** The device setting a play with no word of its own falls back to. */
  showDefense: boolean;
  /**
   * One man's job, for a player studying his own: his line at full strength
   * and everybody else's faded back. With `quiz`, his line is not drawn at all
   * — the question is what he does, and the answer is hidden until asked for.
   */
  focus?: { playerId: string; quiz?: boolean } | null;
}

/**
 * A play, drawn, and nothing else: no pointer, no selection, no handles.
 *
 * The card's picture, lifted out so the shared viewer draws exactly what a
 * card does. The board in the editor is its own thing — it has selection,
 * handles and a pen to answer — and the exporter is a third, for the reasons
 * under *Export*; this is the one that is only ever looked at.
 */
export function PlayPicture({ play, view, showDefense, focus = null }: Props) {
  const qb = quarterback(play.players);

  /*
   * The same rule the board and the sheet use, so a card cannot say one thing
   * about a play and opening it say another.
   */
  const sides = drawnSides(play, showDefense);
  const shownPlayers = play.players.filter((p) =>
    p.side === 'defense' ? sides.defense : sides.offense,
  );

  /* Regenerated from everyone, then cut to the men on the board — a block and a
     cover rope are functions of both ends, so they are rebuilt before filtering
     and never from a half-empty roster. */
  const shownLines = refreshPaths(play.assignments, play.players).filter((a) =>
    shownPlayers.some((p) => p.id === a.playerId),
  );

  return (
    <svg viewBox={viewBox(view)} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <Field holes={[]} showHoles={false} view={view} surface={surfaceOf(play.variant)} />
      {/* Under the play, exactly as on the board. */}
      {(play.zones ?? []).map((z) => (
        <ZoneArea
          key={`zone${z.playerId}`}
          zone={z}
          player={play.players.find((p) => p.id === z.playerId) ?? null}
        />
      ))}
      {/* Both washes hang off a man, so neither outlives the one it
          comes off — as on the board and on the sheet. */}
      {(play.focuses ?? []).map((f) => {
        const man = shownPlayers.find((p) => p.id === f.playerId);
        return man ? (
          <FocusSquare key={`focus${f.playerId}`} player={man} focus={f} />
        ) : null;
      })}
      {play.vision && qb && sides.offense && (
        <VisionCone qb={qb} vision={play.vision} />
      )}
      <BoardMarks marks={play.marks ?? []} />
      {play.annotations.map((path, i) => (
        <path
          key={`ann${i}`}
          d={toPathD(path)}
          fill="none"
          stroke="var(--board-chalk)"
          strokeWidth={0.16}
          strokeLinecap="round"
          opacity={0.7}
        />
      ))}
      {/*
        * Regenerated, not as stored. A block, a cover rope and a stunt are
        * all stored as who-does-what-to-whom, so a thumbnail that drew the
        * saved path would be showing where those men used to stand.
        */}
      {shownLines
        .filter((a) => !(focus?.quiz && a.playerId === focus.playerId))
        .map((a) => (
          <g key={a.id} opacity={focus && a.playerId !== focus.playerId ? 0.22 : undefined}>
            <AssignmentPath assignment={a} autoColor={autoRouteColor(a, play.players)} />
          </g>
        ))}
      {focus && (() => {
        const man = shownPlayers.find((p) => p.id === focus.playerId);
        return man ? (
          <circle cx={man.x} cy={man.y} r={1.2} fill="none" stroke="var(--select)" strokeWidth={0.14} />
        ) : null;
      })()}
      {shownPlayers.map((p) => (
        <PlayerShape
          key={p.id}
          player={p}
          selected={false}
          ball={p.id === play.ballCarrierId}
          ballMark={isFootball(play.variant) ? 'star' : 'ball'}
        />
      ))}
    </svg>
  );
}
