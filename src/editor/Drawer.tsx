import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  onToggle: () => void;
  /** Which edge it lives on. Handedness: keep it away from the writing hand. */
  side: 'left' | 'right';
  children: ReactNode;
}

/**
 * The editor's controls, in a panel that slides off the side of the board.
 *
 * Overlays the stage rather than sitting under it. As a flex sibling every open
 * and close would have resized the board, and the board's size is the scale of
 * the whole coordinate system: folding the tools away would have moved every
 * player out from under the pen.
 *
 * It leaves from the side rather than the bottom because the bottom of the view
 * is the backfield, where the ball carrier and the quarterback are. A panel
 * there covers the men you are drawing. Closed, nothing remains over the field
 * but the tab.
 *
 * The wrapper is inert so taps fall through to the board everywhere the panel
 * is not; only the panel and the tab take pointers.
 */
export function Drawer({ open, onToggle, side, children }: Props) {
  return (
    <div className={`drawer ${side}${open ? ' open' : ''}`}>
      <button
        className="drawer-tab"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={open ? 'Hide the tools' : 'Show the tools'}
      >
        <span aria-hidden="true">{open ? '›' : '‹'}</span>
      </button>
      <div className="drawer-panel">{children}</div>
    </div>
  );
}
