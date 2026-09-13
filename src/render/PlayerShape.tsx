import type { PlayerSlot } from '../domain/types';

// Sized so linemen at typical splits keep visible daylight between them.
const R = 0.72;

interface Props {
  player: PlayerSlot;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
}

export function PlayerShape({ player, selected, onPointerDown }: Props) {
  const fill = player.side === 'offense' ? 'var(--off-fill)' : 'var(--def-fill)';
  const stroke = selected
    ? 'var(--select)'
    : player.side === 'offense'
      ? 'var(--off-line)'
      : 'var(--def-line)';
  const sw = selected ? 0.22 : 0.14;

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
    <g
      transform={`translate(${player.x} ${player.y})`}
      onPointerDown={(e) => onPointerDown(e, player.id)}
      style={{ cursor: 'grab', touchAction: 'none' }}
    >
      {/* generous invisible hit area, a fingertip is about a yard and a half */}
      <circle r={R * 1.9} fill="transparent" />
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
