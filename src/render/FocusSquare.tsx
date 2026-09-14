import { useId } from 'react';
import type { Focus, PlayerSlot } from '../domain/types';

interface Props {
  /** The man it comes off. One edge is locked to him; only the far end moves. */
  player: PlayerSlot;
  focus: Focus;
}

/** Never a sliver and never the whole field, however far the focus is dragged. */
const MIN_REACH = 2.5;
const MAX_REACH = 20;

/** Where a square lands when it is first switched on: out in front of him. */
export const FOCUS_AHEAD = 6;

/**
 * How far out the square goes, which is also how wide it is — it is a square,
 * so dragging the far end further out opens it up as well as aiming it.
 */
export function focusReach(focus: Focus): number {
  return Math.min(MAX_REACH, Math.max(MIN_REACH, Math.hypot(focus.dx, focus.dy)));
}

/**
 * The rotation, in degrees, that turns the local frame onto the line from the
 * player to his focus. `rotate(a)` sends (0,1) to (-sin a, cos a), so this is
 * the angle whose local "forward" lands on the offset.
 */
function facing(focus: Focus): number {
  return (Math.atan2(-focus.dx, focus.dy) * 180) / Math.PI;
}

/**
 * Is this tap inside the square?
 *
 * Like the cone, the square is its own grab handle: there is nothing to aim at
 * but the wash, which is a big target for a stylus Chrome hit-tests at the
 * exact pixel. The tap is rotated back into the local frame rather than the
 * square being rotated into the field, which is the same arithmetic once and
 * not four corners' worth.
 */
export function insideFocus(player: PlayerSlot, focus: Focus, at: { x: number; y: number }) {
  const reach = focusReach(focus);
  const a = (-facing(focus) * Math.PI) / 180;
  const vx = at.x - player.x;
  const vy = at.y - player.y;
  const lx = vx * Math.cos(a) - vy * Math.sin(a);
  const ly = vx * Math.sin(a) + vy * Math.cos(a);
  return Math.abs(lx) <= reach / 2 && ly >= 0 && ly <= reach;
}

/**
 * A faint square coming off a man, saying where he is working.
 *
 * The vision cone in square form, and deliberately so: it is anchored on the
 * player exactly as the cone's apex is, only the far end is stored, and it is
 * moved by dragging the wash itself. The cone opens out as it goes because a
 * quarterback's read widens downfield; this one stays square, because a man
 * working a spot is working a patch of the same width all the way out.
 *
 * The fade runs from him to the far edge, so it reads as coming off him rather
 * than as a box that happens to be nearby. Under everything, like the cone: a
 * highlight over the routes would be hiding the play it is pointing at.
 */
export function FocusSquare({ player, focus }: Props) {
  // A fixed name would collide: the playbook screen puts a dozen thumbnails in
  // one document, and every reference resolves to the first <defs> to claim it.
  const fadeId = `focus${useId().replace(/:/g, '')}`;

  const reach = focusReach(focus);
  const angle = facing(focus);

  return (
    <g pointerEvents="none">
      <defs>
        {/* In the local frame, the rotated one the square is drawn in, so the
            fade runs out along it rather than down the field. */}
        <linearGradient id={fadeId} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={0} y2={reach}>
          <stop offset="0" stopColor="var(--focus)" stopOpacity={0.42} />
          <stop offset="0.65" stopColor="var(--focus)" stopOpacity={0.18} />
          <stop offset="1" stopColor="var(--focus)" stopOpacity={0.03} />
        </linearGradient>
      </defs>

      <g transform={`translate(${player.x} ${player.y}) rotate(${angle.toFixed(2)})`}>
        <rect
          x={-reach / 2}
          y={0}
          width={reach}
          height={reach}
          rx={0.35}
          fill={`url(#${fadeId})`}
        />
      </g>
    </g>
  );
}

/** Where a square starts for this man: out in front, which way depending on side. */
export function defaultFocus(player: PlayerSlot): Focus {
  return {
    playerId: player.id,
    dx: 0,
    dy: player.side === 'offense' ? -FOCUS_AHEAD : FOCUS_AHEAD,
  };
}
