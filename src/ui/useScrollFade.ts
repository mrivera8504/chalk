import { useEffect, useRef } from 'react';

/**
 * Marks a scrollable box that actually has more in it than fits.
 *
 * Every capped panel in this app was cutting a row of buttons exactly in half
 * at its boundary, which reads as a broken render rather than as "there is more
 * below". The fix is a fade at the edge — but a fade on a panel whose content
 * fits just dims its last row for no reason, and CSS alone cannot tell the two
 * apart. So the class goes on only when the box genuinely overflows, and the
 * mask hangs off the class.
 *
 * Watches both the box and its contents: the route list changes length whenever
 * a different player is picked, and the drawer's own height changes with the
 * tool that is open.
 */
export function useScrollFade<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const check = () => {
      // A couple of pixels of slack: sub-pixel layout rounding otherwise leaves
      // a permanent fade on a panel that fits exactly.
      el.classList.toggle('scrolls', el.scrollHeight > el.clientHeight + 3);
    };

    check();
    const resize = new ResizeObserver(check);
    resize.observe(el);
    const mutate = new MutationObserver(check);
    mutate.observe(el, { childList: true, subtree: true, characterData: true });

    return () => {
      resize.disconnect();
      mutate.disconnect();
    };
  }, []);

  return ref;
}
