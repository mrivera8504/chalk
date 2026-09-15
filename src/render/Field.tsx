import type { Gap } from '../domain/gaps';
import type { Hole } from '../domain/types';
import { VIEW } from './geometry';

/** NFHS hash spacing is 53 feet 4 inches, so 8.89 yards either side of center. */
const HASH_X = 8.89;

interface Props {
  holes: Hole[];
  showHoles: boolean;
  /** x positions of players near the LOS, so hole numbers do not hide behind them. */
  occupied?: number[];
  /** The same spaces, lettered, for the defense. */
  gaps?: Gap[];
  showGaps?: boolean;
}

export function Field({ holes, showHoles, occupied = [], gaps = [], showGaps = false }: Props) {
  const lines: number[] = [];
  for (let y = -VIEW.downfield; y <= VIEW.behind; y += 5) {
    if (y !== 0) lines.push(y);
  }

  return (
    <g className="field">
      <rect
        x={-VIEW.halfWidth}
        y={-VIEW.downfield}
        width={VIEW.halfWidth * 2}
        height={VIEW.downfield + VIEW.behind}
        fill="var(--turf)"
      />

      {/* five yard lines */}
      {lines.map((y) => (
        <line
          key={`y${y}`}
          x1={-VIEW.halfWidth}
          x2={VIEW.halfWidth}
          y1={y}
          y2={y}
          stroke="var(--turf-line)"
          strokeWidth={0.12}
        />
      ))}

      {/* hash marks every yard */}
      {Array.from({ length: VIEW.downfield + VIEW.behind + 1 }, (_, i) => {
        const y = -VIEW.downfield + i;
        if (y % 5 === 0) return null;
        return (
          <g key={`h${y}`} stroke="var(--turf-line)" strokeWidth={0.1}>
            <line x1={-HASH_X - 0.35} x2={-HASH_X + 0.35} y1={y} y2={y} />
            <line x1={HASH_X - 0.35} x2={HASH_X + 0.35} y1={y} y2={y} />
          </g>
        );
      })}

      {/* line of scrimmage */}
      <line
        x1={-VIEW.halfWidth}
        x2={VIEW.halfWidth}
        y1={0}
        y2={0}
        stroke="var(--los)"
        strokeWidth={0.22}
      />

      {showHoles &&
        holes
          .filter((h) => !occupied.some((x) => Math.abs(x - h.x) < 1.15))
          .map((h) => (
          <text
            key={`hole${h.number}-${h.x.toFixed(2)}`}
            x={h.x}
            y={1.15}
            textAnchor="middle"
            fontSize={0.95}
            fontWeight={600}
            fill="var(--hole)"
          >
            {h.number}
          </text>
        ))}

      {/*
        * The same spaces, read from the other side of the ball. Letters go
        * above the line and numbers below it, which is not decoration: each
        * unit reads its own map off its own side of the LOS, and the two can
        * be up together without a 2 and a B sitting on top of each other.
        */}
      {showGaps &&
        gaps
          .filter((g) => !occupied.some((x) => Math.abs(x - g.x) < 1.15))
          .map((g) => (
            <text
              key={`gap${g.side}${g.letter}-${g.x.toFixed(2)}`}
              x={g.x}
              y={-0.45}
              textAnchor="middle"
              fontSize={0.95}
              fontWeight={600}
              fill="var(--hole)"
            >
              {g.letter}
            </text>
          ))}
    </g>
  );
}
