import type { ReactNode } from 'react';
import { Icon, type IconName } from '../ui/Icon';
import { go, toPath, type Screen } from '../ui/route';

const TABS: { screen: Screen; label: string; icon: IconName }[] = [
  { screen: 'book', label: 'Playbook', icon: 'book' },
  { screen: 'team', label: 'Team', icon: 'team' },
  { screen: 'print', label: 'Print', icon: 'print' },
  { screen: 'settings', label: 'Settings', icon: 'settings' },
];

interface Props {
  screen: Screen;
  children: ReactNode;
}

/**
 * The app around the editor: one screen at a time, and the bar that says which.
 *
 * The roster, the sheets, the account and the settings used to open as panels
 * stacked on top of the playbook, behind a ⋯ — four things a coach had to know
 * were there, each pushing the plays down the page when it opened. They are
 * places now, and the way to them is always on screen.
 *
 * Along the bottom on a phone, where a thumb is; down the side once the screen
 * is wide enough to spare the width, which is every tablet in landscape. The
 * editor is not inside this. A play is opened to be drawn on, and a bar under
 * the board would be a sibling of the stage that could change its height.
 */
export function AppShell({ screen, children }: Props) {
  return (
    <div className="shell">
      <main className="shell-main">{children}</main>
      <nav className="shell-nav" aria-label="Main">
        {TABS.map((t) => (
          <a
            key={t.screen}
            href={toPath({ screen: t.screen })}
            aria-current={screen === t.screen ? 'page' : undefined}
            onClick={(e) => {
              // A real link, so it has an address and reads as navigation, but
              // followed in the app: a page load would cost the unsaved moment.
              e.preventDefault();
              go({ screen: t.screen });
            }}
          >
            <span className="nav-mark">
              <Icon name={t.icon} size={22} />
            </span>
            {t.label}
          </a>
        ))}
      </nav>
    </div>
  );
}

/** A screen's own header: its name, a line under it, and room for one action. */
export function PageHead({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div className="page-title">
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children}
    </header>
  );
}
