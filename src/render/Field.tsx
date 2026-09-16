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
  /**
   * How much field to lay down, in yards. The board's own window unless a
   * printed sheet asks for a wider one — the turf, the five yard lines and the
   * hash marks all have to reach the edge of whatever window is being drawn, or
   * a landscape sheet shows a field that stops halfway across the paper.
   */
  view?: { x: number; y: number; w: number; h: number };
}

const BOARD_VIEW = {
  x: -VIEW.halfWidth,
  y: -VIEW.downfield,
  w: VIEW.halfWidth * 2,
  h: VIEW.downfield + VIEW.behind,
};

export function Field({
  holes,
  showHoles,
  occupied = [],
  gaps = [],
  showGaps = false,
  view = BOARD_VIEW,
}: Props) {
  const left = view.x;
  const right = view.x + view.w;
  const top = view.y;
  const bottom = view.y + view.h;

  // Whole yards, so the lines land where they land on a field rather than
  // wherever the window happens to begin.
  const lines: number[] = [];
  for (let y = Math.ceil(top / 5) * 5; y <= bottom; y += 5) {
    if (y !== 0) lines.push(y);
  }

  return (
    <g className="field">
      <rect x={left} y={top} width={view.w} height={view.h} fill="var(--turf)" />

      {/* five yard lines */}
      {lines.map((y) => (
        <line
          key={`y${y}`}
          x1={left}
          x2={right}
          y1={y}
          y2={y}
          stroke="var(--turf-line)"
          strokeWidth={0.12}
        />
      ))}

      {/* hash marks every yard */}
      {Array.from({ length: Math.floor(bottom) - Math.ceil(top) + 1 }, (_, i) => {
        const y = Math.ceil(top) + i;
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
        x1={left}
        x2={right}
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
