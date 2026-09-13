import type { Assignment, AssignmentKind, PathPoint } from '../domain/types';
import { headingInto, toPathD } from './geometry';

/** Half the width of a T-cap, and the length of an arrowhead. In yards. */
const CAP = 0.46;
const ARROW = 0.5;

type EndCap = 'tee' | 'arrow' | 'none';

interface Style {
  cap: EndCap;
  dash?: string;
  color: string;
}

/**
 * One row per kind, so a play reads by line style alone in black and white on a
 * printed call sheet. Only the block family is drawn by stage 2; carry gets its
 * wavy treatment when the ball-carrier tool lands.
 */
const STYLE: Record<AssignmentKind, Style> = {
  route: { cap: 'arrow', color: 'var(--ink-route)' },
  block: { cap: 'tee', color: 'var(--ink-block)' },
  combo: { cap: 'tee', color: 'var(--ink-block)' },
  pull: { cap: 'tee', color: 'var(--ink-block)' },
  carry: { cap: 'arrow', color: 'var(--ink-carry)' },
  motion: { cap: 'arrow', dash: '0.55 0.38', color: 'var(--ink-motion)' },
  option: { cap: 'arrow', dash: '0.12 0.34', color: 'var(--ink-option)' },
  stay: { cap: 'none', color: 'var(--ink-block)' },
};

function Cap({
  kind,
  points,
  index,
  color,
  width,
}: {
  kind: EndCap;
  points: PathPoint[];
  index: number;
  color: string;
  width: number;
}) {
  if (kind === 'none' || index < 1) return null;

  const p = points[index];
  const u = headingInto(points, index);
  // Perpendicular to the direction of travel.
  const px = -u.y;
  const py = u.x;

  if (kind === 'tee') {
    return (
      <line
        x1={p.x + px * CAP}
        y1={p.y + py * CAP}
        x2={p.x - px * CAP}
        y2={p.y - py * CAP}
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
      />
    );
  }

  const backX = p.x - u.x * ARROW;
  const backY = p.y - u.y * ARROW;
  return (
    <polygon
      points={[
        `${p.x},${p.y}`,
        `${backX + px * ARROW * 0.55},${backY + py * ARROW * 0.55}`,
        `${backX - px * ARROW * 0.55},${backY - py * ARROW * 0.55}`,
      ].join(' ')}
      fill={color}
    />
  );
}

interface Props {
  assignment: Assignment;
  selected?: boolean;
}

export function AssignmentPath({ assignment, selected = false }: Props) {
  const { kind, path } = assignment;
  if (path.length < 2) return null;

  const style = STYLE[kind];
  const color = selected ? 'var(--select)' : (assignment.color ?? style.color);
  const width = selected ? 0.24 : 0.17;
  const d = toPathD(path);

  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeDasharray={style.dash}
        strokeLinecap="round"
        strokeLinejoin="round"
        pointerEvents="none"
      />
      {/* a combo caps the down lineman on the way through, then again at the climb */}
      {kind === 'combo' && (
        <Cap kind="tee" points={path} index={1} color={color} width={width} />
      )}
      <Cap
        kind={style.cap}
        points={path}
        index={path.length - 1}
        color={color}
        width={width}
      />
    </g>
  );
}
