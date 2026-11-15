import { chromium, type Browser, type Page } from 'playwright';

/**
 * A Galaxy S Pen, as the traces in CLAUDE.md describe it.
 *
 * Playwright has no stylus, and its mouse is nothing like one: it holds contact
 * and it cannot hover. So the events are built by hand to the shape that was
 * measured on the device — contact lasting a few milliseconds, pressure 0.00 on
 * every pointerdown, one press arriving as several down/up pairs 10-25ms apart,
 * and moves at `buttons=0` in between.
 *
 * These prove the editor's decisions given that input. They do not prove the
 * device still sends it; the tablet is the only witness to that.
 */
export interface Yd {
  x: number;
  y: number;
}

export async function launch(): Promise<Browser> {
  return chromium.launch();
}

/** A fresh page with a known book already in storage and no way to the cloud. */
export async function openApp(browser: Browser, opts: { width?: number; height?: number; book?: unknown } = {}) {
  const context = await browser.newContext({
    viewport: { width: opts.width ?? 1280, height: opts.height ?? 800 },
    hasTouch: true,
  });
  // Nothing in a test signs in, mints an account or writes a playbook anywhere.
  await context.route((url) => url.hostname !== 'localhost', (r) => r.abort());
  const page = await context.newPage();
  await page.addInitScript((book) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    if (book) localStorage.setItem('chalk.playbook.v1', JSON.stringify(book));
    // The tools out, so a test never depends on which way the screen is turned.
    localStorage.setItem('chalk.drawer.v1', 'open');
  }, opts.book ?? null);
  await page.goto(process.env.CHALK_URL!);
  return { context, page };
}

/** Where a spot on the field is on the glass, through the board's own matrix. */
export async function toClient(page: Page, at: Yd): Promise<{ x: number; y: number }> {
  return page.evaluate(({ x, y }) => {
    const svg = document.querySelector('.stage svg') as SVGSVGElement;
    const p = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM()!);
    return { x: p.x, y: p.y };
  }, at);
}

/**
 * Refuse a spot that is under a panel or a button.
 *
 * The quick bar sits over the bottom corner of the board, and a "tap on open
 * grass" aimed there once landed on the board-sliding toggle and passed for the
 * wrong reason. A test that means the board says so, and is told when it is not.
 */
export async function onBoard(page: Page, at: Yd): Promise<void> {
  const c = await toClient(page, at);
  const hit = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return el?.classList.contains('stage') ? null : (el?.outerHTML.slice(0, 80) ?? 'nothing');
  }, c);
  if (hit) throw new Error(`(${at.x}, ${at.y}) is not open board: it is under ${hit}`);
}

type Kind = 'pen' | 'touch';

interface Step {
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointerrawupdate';
  x: number;
  y: number;
  kind: Kind;
  buttons: number;
  /** Milliseconds to wait after this event, on the page's own clock. */
  wait: number;
  /** Send it to the stage whatever is under it, as a captured drag would be. */
  captured?: boolean;
}

/**
 * Play a run of pointer events inside the page.
 *
 * In one call, timed by the page, because the gaps are the whole point: a
 * bounce is a bounce because it lands 14ms after the last lift, and a round
 * trip to the test runner between events takes longer than that on its own.
 */
async function play(page: Page, steps: Step[]) {
  await page.evaluate(async (steps) => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    for (const s of steps) {
      const under = document.elementFromPoint(s.x, s.y) ?? document.body;
      const target = s.captured ? (document.querySelector('.stage') ?? under) : under;
      target.dispatchEvent(
        new PointerEvent(s.type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: s.kind === 'pen' ? 7 : 11,
          pointerType: s.kind,
          isPrimary: true,
          clientX: s.x,
          clientY: s.y,
          buttons: s.buttons,
          // 0.00 on every pointerdown, exactly as the device reports it.
          pressure: s.type === 'pointermove' && s.buttons ? 0.05 : 0,
        }),
      );
      if (s.wait) await sleep(s.wait);
    }
    // One frame, so whatever the last event set in motion has rendered.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  }, steps);
}

/** Down/up pairs at one spot: `contact` ms on the glass, `gap` ms off it. */
function burst(c: { x: number; y: number }, pairs: number, contact = 4, gap = 14): Step[] {
  const out: Step[] = [];
  for (let i = 0; i < pairs; i++) {
    const p = { x: c.x + (i % 2 ? 1.5 : -1), y: c.y + (i % 3 ? -1 : 1) };
    out.push({ type: 'pointerdown', ...p, kind: 'pen', buttons: 1, wait: contact });
    out.push({ type: 'pointerup', ...p, kind: 'pen', buttons: 0, wait: i < pairs - 1 ? gap : 0 });
  }
  return out;
}

/**
 * One press of the pen on the board: `pairs` down/up pairs, a few milliseconds
 * of contact each, wandering by a pixel or two. Five pairs at the default
 * timing span about 75ms.
 */
export async function penTap(page: Page, at: Yd, pairs = 5, timing: { contact?: number; gap?: number } = {}) {
  await play(page, burst(await toClient(page, at), pairs, timing.contact, timing.gap));
}

/**
 * The pen traveling off the glass: moves at buttons=0.
 *
 * `raw` sends them as `pointerrawupdate`, which is what Chrome delivers on a
 * secure origin — so on the deployed app, and not over the LAN — and what the
 * pencil listens for natively when it is there.
 */
export async function penHover(page: Page, from: Yd, to: Yd, steps = 12, raw = false) {
  const a = await toClient(page, from);
  const b = await toClient(page, to);
  await play(
    page,
    Array.from({ length: steps }, (_, i): Step => {
      const t = (i + 1) / steps;
      return {
        type: raw ? 'pointerrawupdate' : 'pointermove',
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        kind: 'pen',
        buttons: 0,
        wait: 6,
        captured: raw,
      };
    }),
  );
}

/** A finger: one contact, held the whole way. */
export async function fingerDrag(page: Page, from: Yd, to: Yd, steps = 12) {
  const a = await toClient(page, from);
  const b = await toClient(page, to);
  await play(page, [
    { type: 'pointerdown', ...a, kind: 'touch', buttons: 1, wait: 8 },
    ...Array.from({ length: steps }, (_, i): Step => {
      const t = (i + 1) / steps;
      return { type: 'pointermove', x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, kind: 'touch', buttons: 1, wait: 6, captured: true };
    }),
    { type: 'pointerup', ...b, kind: 'touch', buttons: 0, wait: 0, captured: true },
  ]);
}

/**
 * A light pen tap on a button: the pairs arrive, and the browser synthesizes no
 * click at all — which is what "the pen needs a hard press" turned out to be.
 */
export async function penTapButton(page: Page, name: string | RegExp, pairs = 4) {
  const box = await page.getByRole('button', { name }).first().boundingBox();
  if (!box) throw new Error(`no button ${String(name)}`);
  await play(page, burst({ x: box.x + box.width / 2, y: box.y + box.height / 2 }, pairs));
  // penTaps waits 150ms for the browser's own click before making one.
  await page.waitForTimeout(260);
}

/** The play as the app has saved it — in yards, which is what gets asserted. */
export async function savedPlay(page: Page, index = 0) {
  return page.evaluate((i) => {
    const book = JSON.parse(localStorage.getItem('chalk.playbook.v1') ?? '{"plays":[]}');
    return book.plays[i] ?? null;
  }, index);
}

export const man = (play: { players: { label: string; x: number; y: number; id: string }[] }, label: string) =>
  play.players.find((p) => p.label === label)!;
