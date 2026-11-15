import { useState } from 'react';
import { readRoster, type RosterEntry } from '../domain/roster';
import type { Play, Section } from '../domain/types';
import { SettingsPanel } from '../editor/SettingsPanel';
import { ExportPanel } from '../export/ExportPanel';
import { AccountPanel } from '../playbook/AccountPanel';
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

export function TeamPage() {
  const [roster, setRoster] = useState<RosterEntry[]>(readRoster);
  return (
    <div className="page">
      <PageHead
        title="Team"
        sub={`${roster.length} ${roster.length === 1 ? 'player' : 'players'} on the roster`}
      />
      <RosterPanel roster={roster} onChange={setRoster} />
    </div>
  );
}

interface PrintProps {
  plays: Play[];
  sections: Section[];
  onJson: () => void;
  onRestore: (text: string) => void;
}

export function PrintPage({ plays, sections, onJson, onRestore }: PrintProps) {
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
