import { useEffect, useState } from 'react';

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * The add-to-home-screen prompt.
 *
 * A browser only offers this once, on its own schedule, and the event is lost
 * if nothing catches it — so it is caught here and held until there is a button
 * to attach it to. Returns null when there is nothing to offer, which is the
 * normal case on a desktop and on an app that is already installed.
 */
export function useInstallPrompt(): (() => void) | null {
  const [event, setEvent] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      // Without this Chrome shows its own bar over the board.
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    const onInstalled = () => setEvent(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!event) return null;
  return () => {
    void event.prompt();
    // One offer per event; the browser will hand over another if it wants to.
    void event.userChoice.finally(() => setEvent(null));
  };
}
