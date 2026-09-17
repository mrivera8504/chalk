/**
 * Pointer trace, for diagnosing input on a device that is not in front of you.
 * Off unless the URL carries ?trace, so it costs normal use nothing.
 *
 * Raw events alone do not say much. What matters is pairing each event with the
 * decision the editor made from it: which player it picked, how far away that
 * player was, and whether it gave up and cleared the selection instead.
 */
export const TRACING = typeof location !== 'undefined' && new URLSearchParams(location.search).has('trace');

const MAX_LINES = 300;
const lines: string[] = [];
const listeners = new Set<() => void>();
let t0 = 0;

export function trace(text: string): void {
  if (!TRACING) return;
  const now = performance.now();
  if (!t0) t0 = now;
  lines.push(`${(now - t0).toFixed(0).padStart(6)}ms  ${text}`);
  if (lines.length > MAX_LINES) lines.shift();
  listeners.forEach((fn) => fn());
}

/** One line per event, plus a header of everything about the device I cannot see. */
export function traceText(): string {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const head = [
    `chalk pointer trace`,
    `ua            ${navigator.userAgent}`,
    `platform      ${nav.userAgentData?.platform ?? 'n/a'}`,
    `dpr           ${window.devicePixelRatio}`,
    `viewport      ${window.innerWidth} x ${window.innerHeight}`,
    `maxTouch      ${navigator.maxTouchPoints}`,
    `rawupdate     ${'onpointerrawupdate' in window}`,
    `coalesced     ${'getCoalescedEvents' in PointerEvent.prototype}`,
    `predicted     ${'getPredictedEvents' in PointerEvent.prototype}`,
    `events        ${lines.length}`,
    '',
  ];
  return head.concat(lines).join('\n');
}

export function traceLines(): string[] {
  return lines;
}

export function clearTrace(): void {
  lines.length = 0;
  t0 = 0;
  listeners.forEach((fn) => fn());
}

export function onTrace(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Compact description of a pointer event: the fields that decide behavior. */
export function describeEvent(e: React.PointerEvent | PointerEvent, at?: { x: number; y: number }): string {
  const where = at ? ` (${at.x.toFixed(1)},${at.y.toFixed(1)})yd` : '';
  const target = (e.target as Element | null)?.tagName?.toLowerCase() ?? '?';
  return (
    `${e.type.padEnd(16)} ${String(e.pointerType).padEnd(5)} id=${e.pointerId} ` +
    `btn=${e.buttons} p=${e.pressure.toFixed(2)}${where} on <${target}>`
  );
}
