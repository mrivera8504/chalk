import { COURT } from '../sports/basketball/court';

interface Props {
  view: { x: number; y: number; w: number; h: number };
}

/**
 * A half court: the floor, the lines, the basket.
 *
 * Drawn from the same two tokens the field is — `--turf` for the surface and
 * `--turf-line` for the paint — so the white-board setting, the light theme
 * and the print palette all reach it without being told a court exists. A
 * court is not green, and the floor's own color is one more token for stage 5;
 * what matters here is that every line is where the paint is.
 */
export function Court({ view }: Props) {
  const { halfWidth: hw, length, rim, rimRadius, backboard, lane, circle, arc } = COURT;
  // Where the arc's straight sides hand over to the curve: level with the rim.
  const arcD = [
    `M ${-arc} 0`,
    `L ${-arc} ${rim.y}`,
    `A ${arc} ${arc} 0 0 0 ${arc} ${rim.y}`,
    `L ${arc} 0`,
  ].join(' ');
  const line = { fill: 'none', stroke: 'var(--turf-line)', strokeWidth: 0.09 };

  return (
    <g className="field court">
      <rect x={view.x} y={view.y} width={view.w} height={view.h} fill="var(--turf)" />
      {/* sidelines, baseline and the half-court line */}
      <rect x={-hw} y={0} width={hw * 2} height={length} {...line} strokeWidth={0.12} />
      {/* the lane and the free-throw circle */}
      <rect x={-lane.half} y={0} width={lane.half * 2} height={lane.length} {...line} />
      <circle cx={0} cy={lane.length} r={circle} {...line} />
      <path d={arcD} {...line} />
      {/* the half of the center circle that is on this side of the line */}
      <path d={`M ${-circle} ${length} A ${circle} ${circle} 0 0 1 ${circle} ${length}`} {...line} />
      {/* backboard and rim */}
      <line
        x1={-backboard.half}
        y1={backboard.y}
        x2={backboard.half}
        y2={backboard.y}
        stroke="var(--turf-line)"
        strokeWidth={0.14}
        strokeLinecap="round"
      />
      <circle cx={rim.x} cy={rim.y} r={rimRadius} fill="none" stroke="var(--los)" strokeWidth={0.1} />
    </g>
  );
}
