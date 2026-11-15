import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useBackLayer } from './backstack';
import { Icon } from './Icon';

interface Props {
  /** What the button is for, read out: 'More for Jet Sweep'. */
  label: string;
  /**
   * What the button shows, when it is not the three dots: the playbook's own
   * name is the button that changes playbook.
   */
  trigger?: ReactNode;
  children: (close: () => void) => ReactNode;
}

/**
 * The few things done to a card once in a while, behind one button.
 *
 * A play card used to wear a folder select, Copy and Delete on its face, every
 * card, all the time — three controls a coach uses once a week between him and
 * the forty thumbnails he is scanning. They are one tap further away now and
 * the wall is gone.
 *
 * Plain buttons in a small sheet, so `ui/penTaps.ts` covers them the way it
 * covers every other button; nothing here needs a hover or a held press. It
 * closes on a tap outside, on Escape, and on the back gesture, which it
 * registers for like every other thing that opens over the app.
 */
export function Menu({ label, trigger, children }: Props) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useBackLayer(open, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  return (
    <div className="menu" ref={box}>
      <button
        className={trigger ? 'menu-trigger' : 'icon-button'}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {trigger ?? <Icon name="more" />}
      </button>
      {open && (
        <div className="menu-sheet" role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
