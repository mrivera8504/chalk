import { PLAYER_R as R, type PlayerSlot } from '../domain/types';

interface Props {
  player: PlayerSlot;
  selected: boolean;
  /** Picked as the blocker, waiting on a defender. */
  pending?: boolean;
  /** The pen is hovering close enough that a press would land on this one. */
  hovered?: boolean;
}

export function PlayerShape({ player, selected, pending = false, hovered = false }: Props) {
  const fill = player.side === 'offense' ? 'var(--off-fill)' : 'var(--def-fill)';
  const stroke = selected || pending
    ? 'var(--select)'
    : player.side === 'offense'
      ? 'var(--off-line)'
      : 'var(--def-line)';
  const sw = selected || pending ? 0.22 : 0.14;

  let body: React.ReactNode;
  switch (player.shape) {
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
      {player.shape !== 'x' && (
        <text
          textAnchor="middle"
          y={0.3}
          fontSize={0.82}
          fontWeight={600}
          fill={player.side === 'offense' ? 'var(--off-text)' : 'var(--def-text)'}
          pointerEvents="none"
        >
          {player.label}
        </text>
      )}
      {player.onLineLocked && player.side === 'offense' && (
        <circle cx={R * 0.95} cy={-R * 0.95} r={0.2} fill="var(--locked)" pointerEvents="none" />
      )}
    </g>
  );
}
