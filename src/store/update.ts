/**
 * Noticing that a new build exists, on a device that never closes.
 *
 * The service worker is what makes the app work in a field with no signal, and
 * it is also what let a tablet sit two commits behind for a day without saying
 * so: the route handle shipped, the phone had it that afternoon, and the tablet
 * — installed to the home screen and only ever backgrounded, never closed —
 * kept serving the bundle it had cached and drew no handle at all. Nothing was
 * broken on it. It was simply running yesterday's app, and the only way to find
 * out was to read the build stamp off the settings panel.
 *
 * A browser checks for a new worker when the page loads. An installed PWA that
 * is never closed does not load a page for weeks, so that check never comes.
 * This asks for it instead — when the app comes back to the front, when the
 * signal returns, and on a slow timer for the day it stays open on the
 * sideline — and puts the answer on screen rather than reloading underneath a
 * coach mid-play.
 *
 * Shaped like `dialog.ts`: a tiny external store and plain functions, so the
 * bar that shows it needs no provider threaded through the app.
 */
import { registerSW } from 'virtual:pwa-register';

/**
 * Slow on purpose. This is the backstop for a tablet that stays open all day;
 * coming back to the front is the check that will actually catch most updates,
 * and a timer that fires in a backgrounded PWA is throttled to roughly this
 * anyway.
 */
const CHECK_MS = 30 * 60 * 1000;

/**
 * If the worker takes over without the page following it, reload anyway. The
 * coach asked for the new version; being left on the old one with the bar gone
 * is the one outcome worse than not offering it.
 */
const RELOAD_FALLBACK_MS = 3000;

let ready = false;
let reload: ((reloadPage?: boolean) => Promise<void>) | null = null;
const listeners = new Set<() => void>();

function announce() {
  for (const l of listeners) l();
}

export function subscribeUpdate(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function updateReady(): boolean {
  return ready;
}

/** Take the new build now. Resolves into a reload, so nothing follows it. */
export function applyUpdate(): void {
  const take = reload;
  ready = false;
  announce();
  if (!take) {
    window.location.reload();
    return;
  }
  void take(true).catch(() => window.location.reload());
  window.setTimeout(() => window.location.reload(), RELOAD_FALLBACK_MS);
}

/**
 * Not now.
 *
 * Only clears the bar: the worker stays waiting, and the next check offers it
 * again. A coach halfway through drawing a play should be able to wave this
 * away without being asked twice in the same minute, and without it being gone
 * for good.
 */
export function dismissUpdate(): void {
  ready = false;
  announce();
}

export function watchForUpdates(): void {
  reload = registerSW({
    immediate: true,
    onNeedRefresh() {
      ready = true;
      announce();
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      // Offline it would only fail, and this runs on a device that is offline
      // by design for most of a practice.
      const check = () => {
        if (navigator.onLine) void registration.update().catch(() => {});
      };

      // Registering has already asked once, so there is no check here: these
      // are the three moments a long-lived install would otherwise never ask
      // again.
      window.addEventListener('online', check);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      window.setInterval(check, CHECK_MS);
    },
    onRegisterError(err) {
      // Not fatal: the app runs from cache either way, and the build stamp in
      // settings is still there to answer which bundle this is.
      console.warn('service worker registration failed:', err);
    },
  });
}
