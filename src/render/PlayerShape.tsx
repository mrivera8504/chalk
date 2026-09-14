import { PLAYER_R as R, type PlayerSlot } from '../domain/types';

interface Props {
  player: PlayerSlot;
  selected: boolean;
  /** Picked as the blocker, waiting on a defender. */
  pending?: boolean;
  /** The pen is hovering close enough that a press would land on this one. */
  hovered?: boolean;
  /** Starred as the man getting the ball. */
  ball?: boolean;
}

/**
 * A five-pointed star, in yards, centred on the origin.
 *
 * Drawn rather than typed as a glyph: a text star renders in whatever font the
 * device happens to have, and this same component is serialized into an export
 * that carries no fonts with it at all.
 *
 * `inner` is the waist as a fraction of the point. A star used as a mark has to
 * hold a label, so it is drawn with a much fatter waist than the default.
 */
function starPoints(r: number, inner = 0.42): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r * inner : r;
    // Start at the top, so the point sits upright rather than on its side.
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(Math.cos(a) * rad).toFixed(3)},${(Math.sin(a) * rad).toFixed(3)}`);
  }
  return pts.join(' ');
}

export function PlayerShape({
  player,
  selected,
  pending = false,
  hovered = false,
  ball = false,
}: Props) {
  /*
   * The man with the ball is drawn as a star in the ball colour, whatever mark
   * he would otherwise wear. It used to be a small star pinned to the corner of
   * his mark, which is a badge on a player rather than a player you can pick out
   * — and picking the carrier out of eleven marks at a glance is the whole job.
   *
   * Derived, never stored: his own shape is untouched underneath, so handing the
   * ball to somebody else gives him his mark straight back with nothing to undo.
   */
  const shape = ball ? 'star' : player.shape;
  const fill = ball
    ? 'var(--ball)'
    : player.side === 'offense'
      ? 'var(--off-fill)'
      : 'var(--def-fill)';
  const stroke = selected || pending
    ? 'var(--select)'
    : ball
      ? 'var(--ball-line)'
      : player.side === 'offense'
        ? 'var(--off-line)'
        : 'var(--def-line)';
  const sw = selected || pending ? 0.22 : 0.14;

  let body: React.ReactNode;
  switch (shape) {
    case 'square':
      body = (
        <rect x={-R} y={-R} width={R * 2} height={R * 2} rx={0.18} fill={fill} stroke={stroke} strokeWidth={sw} />
      );
      break;
    case 'triangle':
      body = (
        <polygon
          points={`0,${-R * 1.1} ${R},${R * 0.75} ${-R},${R * 0.75}`}
          fill={fill}
          stroke={stroke}
          strokeWidth={sw}
        />
      );
      break;
    case 'star':
      /*
       * A fat star, and no wider than 1.28R. The waist has to hold the label,
       * so it is nothing like a sharp star; the points have to stop short of
       * 0.9yd, or two stars on adjacent line splits — 1.8yd apart — would
       * touch. This is also what the ball carrier is drawn as.
       */
      body = (
        <polygon
          points={starPoints(R * 1.28, 0.66)}
          fill={fill}
          stroke={stroke}
          strokeWidth={sw}
          strokeLinejoin="round"
        />
      );
      break;
    case 'x':
      body = (
        <g stroke={stroke} strokeWidth={0.24} strokeLinecap="round">
          <circle r={R} fill={fill} stroke="none" />
          <line x1={-R * 0.6} y1={-R * 0.6} x2={R * 0.6} y2={R * 0.6} />
          <line x1={R * 0.6} y1={-R * 0.6} x2={-R * 0.6} y2={R * 0.6} />
        </g>
      );
      break;
    default:
      body = <circle r={R} fill={fill} stroke={stroke} strokeWidth={sw} />;
  }

  return (
    /* No pointer handler and no hit area: the stage hit-tests by proximity, so
       a pen does not have to land exactly on the mark. See nearestPlayer. */
    <g transform={`translate(${player.x} ${player.y})`} style={{ cursor: 'grab' }}>
      {/* Says, before the pen touches down, who a press would actually pick up. */}
      {hovered && !selected && (
        <circle
          r={R * 1.4}
          fill="none"
          stroke="var(--hover)"
          strokeWidth={0.13}
          pointerEvents="none"
        />
      )}
      {pending && (
        <circle
          r={R * 1.5}
          fill="none"
          stroke="var(--select)"
          strokeWidth={0.11}
          strokeDasharray="0.3 0.26"
          pointerEvents="none"
        />
      )}
      {body}
      {shape !== 'x' && (
        <text
          textAnchor="middle"
          y={0.3}
          fontSize={0.82}
          fontWeight={600}
          /* On the ball star, the mark's own outline colour: it is dark on the
             screen's yellow and white on the black one print swaps in, so the
             label reads on paper as well as on the board. */
          fill={
            ball
              ? 'var(--ball-line)'
              : player.side === 'offense'
                ? 'var(--off-text)'
                : 'var(--def-text)'
          }
          pointerEvents="none"
        >
          {player.label}
        </text>
      )}
      {player.onLineLocked && player.side === 'offense' && (
        <circle cx={R * 0.95} cy={-R * 0.95} r={0.2} fill="var(--locked)" pointerEvents="none" />
      )}
      {/*
        * The shirt of whoever is filling this slot. Outside the mark and below
        * it, where the label inside says the position and this says the kid —
        * the two never compete for the same space.
        */}
      {player.jersey !== undefined && (
        <text
          x={R * 1.32}
          y={R * 1.38}
          textAnchor="middle"
          fontSize={0.58}
          fontWeight={600}
          fill="var(--jersey)"
          pointerEvents="none"
        >
          {player.jersey}
        </text>
      )}
    </g>
  );
}
