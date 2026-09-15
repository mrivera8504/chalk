import { useEffect, type ReactNode } from 'react';
import { useScrollFade } from '../ui/useScrollFade';

interface Props {
  open: boolean;
  onToggle: () => void;
  /** Which edge it lives on. Handedness: keep it away from the writing hand. */
  side: 'left' | 'right';
  /** What the panel is showing: 'Tools', or the picker that is open over them. */
  title: string;
  /** A line under the title, where each picker used to carry its own header. */
  subtitle?: string;
  /** Back to the tool list. Absent while the tools themselves are showing. */
  onBack?: () => void;
  /** Settings and Notes are forms, not palettes, and get the room to be read. */
  wide?: boolean;
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
 *
 * **One header, and it belongs to the drawer.** Every picker used to bring its
 * own, so opening Settings stacked two titles and two dismiss buttons that did
 * different things — one went back to the tools, the other slid the panel away.
 * Those are the back arrow and Hide, and there is one of each.
 */
export function Drawer({
  open,
  onToggle,
  side,
  title,
  subtitle,
  onBack,
  wide = false,
  children,
}: Props) {
  const scroller = useScrollFade<HTMLDivElement>();

  /*
   * A new panel starts at its own top. The scroll position is the panel
   * element's, not the content's, so opening Settings after scrolling to the
   * bottom of the tools dropped you halfway down the settings with the first
   * two groups above the fold and nothing to say they were there.
   */
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0;
  }, [title, scroller]);

  return (
    <div className={`drawer ${side}${open ? ' open' : ''}${wide ? ' wide' : ''}`}>
      <button
        className="drawer-tab"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={open ? 'Hide the tools' : 'Show the tools'}
      >
        <span aria-hidden="true">{open ? '›' : '‹'}</span>
      </button>
      <div className={`drawer-panel${wide ? ' wide' : ''}`} ref={scroller}>
        <div className="drawer-head">
          {onBack && (
            <button className="drawer-back" onClick={onBack} aria-label="Back to the tools">
              <span aria-hidden="true">‹</span>
            </button>
          )}
          <strong>{title}</strong>
          <button className="quiet" onClick={onToggle}>
            Hide
          </button>
        </div>
        {subtitle && <p className="drawer-sub">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}
