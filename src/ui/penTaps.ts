/**
 * Make HTML buttons answer a light pen tap.
 *
 * The board never had this problem: it listens to `pointerdown` directly, which
 * this digitizer fires reliably. A `<button>` does not — it waits for the click
 * the browser synthesizes from a well-formed down/up pair, and on this device a
 * light tap is 3-5ms of contact broken into a burst of pairs. Often no click is
 * produced at all, which is why the pen appeared to need a hard press while a
 * finger, which holds contact throughout, worked first time.
 *
 * So: watch pen taps that start and end on the same button, give the browser a
 * moment to do its own job, and only click the button ourselves if it did not.
 * Nothing changes for a finger or a mouse.
 *
 * Installed once, globally, rather than threaded through every component —
 * a button that needs a hard press is a property of the device, not of any one
 * screen, and the next button anyone adds should not have to know about it.
 */

/** A genuine second tap was never under 200ms in any device trace. */
const REPEAT_MS = 250;

/** Long enough for a real click to land, short enough to feel immediate. */
const GRACE_MS = 150;

function targetButton(e: PointerEvent): HTMLButtonElement | null {
  const el = e.target as Element | null;
  const button = el?.closest?.('button') ?? null;
  return button && !(button as HTMLButtonElement).disabled
    ? (button as HTMLButtonElement)
    : null;
}

export function installPenTaps(): void {
  let downOn: HTMLButtonElement | null = null;
  let armed: { el: Element | null; at: number } = { el: null, at: 0 };

  // Capture, so a component that stops propagation cannot hide the tap.
  document.addEventListener(
    'pointerdown',
    (e) => {
      const ev = e as PointerEvent;
      downOn = ev.pointerType === 'pen' ? targetButton(ev) : null;
    },
    true,
  );

  document.addEventListener(
    'pointerup',
    (e) => {
      const ev = e as PointerEvent;
      if (ev.pointerType !== 'pen') return;

      const up = targetButton(ev);
      const button = up && up === downOn ? up : null;
      downOn = null;
      if (!button) return;

      // Contact bounce delivers the same tap several times over. One press is
      // one press, the same reason the board carries a tapGuard.
      const now = performance.now();
      if (armed.el === button && now - armed.at < REPEAT_MS) return;
      armed = { el: button, at: now };

      let clicked = false;
      const seen = () => {
        clicked = true;
      };
      button.addEventListener('click', seen, { capture: true, once: true });

      window.setTimeout(() => {
        button.removeEventListener('click', seen, true);
        // Still in the document, still enabled, and the browser never fired.
        if (!clicked && button.isConnected && !button.disabled) button.click();
      }, GRACE_MS);
    },
    true,
  );
}
