import type { BoardMark } from '../domain/marks';

interface Props {
  marks: BoardMark[];
  /** The one being carried, drawn with the ring every thing in hand gets. */
  held?: string | null;
}

/**
 * Equipment and labels.
 *
 * Under the players and over the washes: a cone is a thing on the ground that
 * a man runs past. Drawn in the tokens the board already has, so the white
 * board, the print palette and an exported sheet all reach them with nothing
 * added to the list the exporter copies. Shapes, never glyphs — an exported
 * SVG carries no fonts, and a label is the one mark here that is text at all.
 */
export function BoardMarks({ marks, held = null }: Props) {
  // Nothing at all for a play with none, so a play's exported SVG is exactly
  // what it was before there were marks.
  if (!marks.length) return null;
  return (
    <g className="marks" pointerEvents="none">
      {marks.map((m) => (
        <g key={m.id} transform={`translate(${m.x} ${m.y})`}>
          {m.id === held && (
            <circle r={1.05} fill="none" stroke="var(--select)" strokeWidth={0.11} strokeDasharray="0.3 0.26" />
          )}
          <Shape mark={m} />
        </g>
      ))}
    </g>
  );
}

function Shape({ mark }: { mark: BoardMark }) {
  const line = { fill: 'none', stroke: 'var(--board-chalk)', strokeWidth: 0.11, strokeLinejoin: 'round' as const };
  switch (mark.kind) {
    case 'cone':
      // Seen from above and a little to one side, as a cone is always drawn.
      return (
        <g>
          <polygon points="0,-0.55 0.42,0.36 -0.42,0.36" fill="var(--ink-carry)" stroke="var(--ink-carry)" strokeWidth={0.08} strokeLinejoin="round" />
          <line x1={-0.58} y1={0.42} x2={0.58} y2={0.42} stroke="var(--ink-carry)" strokeWidth={0.14} strokeLinecap="round" />
        </g>
      );
    case 'goal':
      // A small goal, mouth toward the bottom of the board: posts and a net.
      return (
        <g>
          <path d="M -1.25 0.35 V -0.4 H 1.25 V 0.35" {...line} strokeWidth={0.14} />
          <path d="M -0.75 -0.4 V 0.2 M -0.25 -0.4 V 0.2 M 0.25 -0.4 V 0.2 M 0.75 -0.4 V 0.2 M -1.25 -0.05 H 1.25" {...line} strokeWidth={0.05} />
        </g>
      );
    case 'ladder':
      return (
        <g>
          <rect x={-0.45} y={-1.5} width={0.9} height={3} {...line} />
          <path d="M -0.45 -0.9 H 0.45 M -0.45 -0.3 H 0.45 M -0.45 0.3 H 0.45 M -0.45 0.9 H 0.45" {...line} />
        </g>
      );
    case 'dummy':
      // A tackling bag, standing: a rounded block.
      return <rect x={-0.4} y={-0.62} width={0.8} height={1.24} rx={0.32} fill="var(--ink-block)" stroke="var(--board-chalk)" strokeWidth={0.08} />;
    case 'hoop':
      // An agility ring on the ground.
      return <circle r={0.6} {...line} stroke="var(--ink-option)" strokeWidth={0.15} />;
    case 'label':
      return (
        <text
          textAnchor="middle"
          y={0.28}
          fontSize={0.9}
          fontWeight={600}
          fill="var(--board-chalk)"
          // Reads over a yard line or a route without a box behind it.
          stroke="var(--turf)"
          strokeWidth={0.22}
          paintOrder="stroke"
        >
          {mark.text}
        </text>
      );
  }
}
