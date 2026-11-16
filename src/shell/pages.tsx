import { useState, type ComponentProps } from 'react';
import { readRoster, type RosterEntry } from '../domain/roster';
import type { Play, Section } from '../domain/types';
import { SettingsPanel } from '../editor/SettingsPanel';
import { ExportPanel } from '../export/ExportPanel';
import { AccountPanel } from '../playbook/AccountPanel';
import { BookHistoryPanel } from '../playbook/BookHistoryPanel';
import { CoachesPanel } from '../playbook/CoachesPanel';
import { DepthPanel } from '../playbook/DepthPanel';
import { PracticePanel } from '../playbook/PracticePanel';
import { RosterPanel } from '../playbook/RosterPanel';
import { useInstallPrompt } from '../store/install';
import { useSettings } from '../store/settings';
import { PageHead } from './AppShell';

/*
 * The four places that are not the playbook. Each is a panel that already
 * existed, given a page to itself: the panels draw no header of their own when
 * they are handed no `onClose`, which is the bargain `SettingsPanel` already
 * struck with the editor's drawer.
 */

/**
 * The team, rather than the plays: who is on it, who plays where, what the
 * week's practices are, and who else coaches it. Views of one page, because
 * each is a list typed once and corrected now and then, and none of them is
 * worth a tab.
 */
export function TeamPage({ plays, coaches }: { plays: Play[]; coaches: ComponentProps<typeof CoachesPanel> }) {
  const [roster, setRoster] = useState<RosterEntry[]>(readRoster);
  const [view, setView] = useState<'roster' | 'depth' | 'practice' | 'coaches'>('roster');
  return (
    <div className="page">
      <PageHead
        title="Team"
        sub={`${roster.length} ${roster.length === 1 ? 'player' : 'players'} on the roster`}
      />
      <div className="picker-row seg team-views" role="group" aria-label="Team">
        <button aria-pressed={view === 'roster'} onClick={() => setView('roster')}>
          Roster
        </button>
        <button aria-pressed={view === 'depth'} onClick={() => setView('depth')}>
          Depth chart
        </button>
        <button aria-pressed={view === 'practice'} onClick={() => setView('practice')}>
          Practices
        </button>
        <button aria-pressed={view === 'coaches'} onClick={() => setView('coaches')}>
          People
        </button>
      </div>
      {view === 'roster' && <RosterPanel roster={roster} onChange={setRoster} />}
      {view === 'depth' && <DepthPanel roster={roster} />}
      {view === 'practice' && <PracticePanel plays={plays} />}
      {view === 'coaches' && <CoachesPanel {...coaches} />}
    </div>
  );
}

interface PrintProps {
  plays: Play[];
  sections: Section[];
  onJson: () => void;
  onRestore: (text: string) => void;
  /** The whole book's history in the cloud, when there is an account to ask. */
  history?: ComponentProps<typeof BookHistoryPanel>;
}

export function PrintPage({ plays, sections, onJson, onRestore, history }: PrintProps) {
  // Read when the page opens, so a roster edited a moment ago is the one printed.
  const [roster] = useState<RosterEntry[]>(readRoster);
  return (
    <div className="page">
      <PageHead
        title="Print"
        sub={`${plays.length} ${plays.length === 1 ? 'play' : 'plays'} in the playbook`}
      />
      <ExportPanel
        plays={plays}
        sections={sections}
        roster={roster}
        onJson={onJson}
        onRestore={onRestore}
      />
      {history && (
        <>
          <PageHead title="History" sub="What the cloud kept of this playbook" />
          <BookHistoryPanel {...history} />
        </>
      )}
    </div>
  );
}

export function SettingsPage({ onSaveNow }: { onSaveNow: () => Promise<void> }) {
  const settings = useSettings();
  const install = useInstallPrompt();
  return (
    <div className="page">
      <PageHead title="Settings" sub="Saved on this device, for every play" />
      <section className="page-section">
        <h2>Account</h2>
        <AccountPanel onSaveNow={onSaveNow} />
      </section>
      {/* Only there when the browser has actually offered; see useInstallPrompt. */}
      {install && (
        <section className="page-section">
          <h2>This device</h2>
          <div className="picker">
            <div className="picker-group">
              <div className="picker-row">
                <button onClick={install}>Install Chalk</button>
              </div>
            </div>
            <p className="picker-note">Puts it on the home screen, where it opens with no signal.</p>
          </div>
        </section>
      )}
      <section className="page-section">
        <h2>The app</h2>
        <SettingsPanel settings={settings} />
      </section>
    </div>
  );
}
