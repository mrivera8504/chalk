/**
 * Screen ink, turned into ink that works on white paper.
 *
 * The board is pastel because it sits on dark turf, and every one of those
 * colours vanishes on white — which is why an export used to swap the whole set
 * for a hand-picked print palette. That palette had two problems. It threw away
 * the colours a coach had actually chosen in Settings, and the hand-picked
 * values did not keep their hue: the lime route went from 69° to 86°, which is
 * the hue of grass, and the block gold went from 46° to 36°, which is the hue of
 * a paper bag. A coach printed a play and asked why the yellow came out green.
 *
 * So nothing is hand-picked here. A print colour is derived from the screen
 * colour by three rules, in this order:
 *
 *   1. The hue never moves. Whatever the coach picked, that is the hue on paper.
 *   2. Saturation is kept as a *fraction* of what the hue can hold, not as an
 *      absolute. Darkening a colour shrinks the room it has for chroma, so an
 *      ink that kept its absolute chroma would come out washed out, and one
 *      pushed to the gamut edge would come out garish — that second mistake
 *      turned the deliberately-muted option grey into a vivid cyan. Holding the
 *      fraction is what makes the pale ones stay pale and the loud ones stay
 *      loud.
 *   3. Lightness comes down only as far as it must. Enough contrast against
 *      white to survive a photocopy and no more — because darkening is exactly
 *      what turns a yellow into an olive, and a route is a 3pt stroke, not body
 *      text, so it does not need the contrast that text would.
 *
 * The work happens in OKLCH rather than HSL. HSL's hue is not perceptual: two
 * colours at the same HSL hue and different lightness do not look like the same
 * colour, which is the whole failure being fixed. OKLab holds hue steady as
 * lightness moves.
 */

/** Björn Ottosson's OKLab, the perceptual space this all happens in. */
interface Oklch {
  /** Perceptual lightness, 0 (black) to 1 (white). */
  l: number;
  /** Chroma — how far from grey. Unbounded in principle, ~0.37 at the sRGB edge. */
  c: number;
  /** Hue in degrees. The number this module exists to leave alone. */
  h: number;
}

type Rgb = { r: number; g: number; b: number };

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

/**
 * Parse the handful of forms a CSS custom property actually arrives in.
 *
 * Settings writes `#rrggbb` because that is what `<input type="color">` gives
 * back, and the stylesheet's own defaults are hex too. Anything else — a
 * keyword, an `rgba()` from one of the structural tokens — is not ink and the
 * caller leaves it alone, so this returns null rather than guessing.
 */
function parseHex(css: string): Rgb | null {
  const hex = css.trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex);
  if (short) {
    return {
      r: parseInt(short[1] + short[1], 16) / 255,
      g: parseInt(short[2] + short[2], 16) / 255,
      b: parseInt(short[3] + short[3], 16) / 255,
    };
  }
  const full = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!full) return null;
  return {
    r: parseInt(full[1], 16) / 255,
    g: parseInt(full[2], 16) / 255,
    b: parseInt(full[3], 16) / 255,
  };
}

function toHex({ r, g, b }: Rgb): string {
  const byte = (n: number) =>
    Math.round(clamp(n, 0, 1) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

/** sRGB's transfer curve, and its inverse. Everything else works in light. */
const toLinear = (n: number) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4);
const toGamma = (n: number) => (n <= 0.0031308 ? n * 12.92 : 1.055 * n ** (1 / 2.4) - 0.055);

function rgbToOklch({ r, g, b }: Rgb): Oklch {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  return {
    l: L,
    c: Math.hypot(a, bb),
    h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360,
  };
}

function oklchToRgb({ l: L, c, h }: Oklch): Rgb {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);

  const l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return {
    r: toGamma(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    g: toGamma(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    b: toGamma(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
  };
}

/** Whether an OKLCH triple survives the trip to sRGB without being clipped. */
function inGamut(colour: Oklch): boolean {
  const { r, g, b } = oklchToRgb(colour);
  const ok = (n: number) => n >= -0.0005 && n <= 1.0005;
  return ok(r) && ok(g) && ok(b);
}

/**
 * The most saturated version of a hue that sRGB can actually print.
 *
 * Bisection rather than the closed form, because the closed form is a page of
 * coefficients to save a few dozen multiplies on six colours. sRGB's gamut is
 * convex in chroma at a fixed lightness and hue, so halving converges.
 */
function maxChroma(l: number, h: number): number {
  let lo = 0;
  let hi = 0.4;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut({ l, c: mid, h })) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** WCAG relative luminance, which is what a contrast ratio is made of. */
function luminance({ r, g, b }: Rgb): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** Against white paper, which is the only background any of this lands on. */
function contrastOnWhite(rgb: Rgb): number {
  return 1.05 / (luminance(rgb) + 0.05);
}

/**
 * How hard a mark has to work on paper.
 *
 * Not one number, because the marks are not one thing. A route is a thick
 * stroke read at arm's length and 3:1 is plenty for it; pushing it further is
 * what costs a yellow its hue. A player label is small text on a white disc and
 * has to hold up against the 4.5:1 that text actually needs.
 */
export const INK_CONTRAST = 3;
export const TEXT_CONTRAST = 4.5;

/**
 * A little of the way toward full saturation, and no more.
 *
 * Paper has no dark turf behind it doing the work, so an ink that held its
 * screen saturation exactly does come out a touch limp. A quarter more than it
 * had: enough to put some body back into a pastel, small enough that a colour
 * chosen to be quiet stays quiet.
 */
const LIFT = 0.25;

/**
 * Almost to the edge of the gamut, never onto it.
 *
 * Sitting exactly on the sRGB boundary means every printer's own gamut mapping
 * has to pull the colour back in, and each one does it differently — which is
 * its own kind of hue shift, arrived at by a different route. A hair inside is
 * a colour that survives the trip.
 */
const CEILING = 0.92;

/**
 * One screen colour, as ink for white paper.
 *
 * Returns the input untouched when it is not a plain hex — the structural
 * tokens are `rgba()` washes and are set by hand for print, not derived.
 */
export function inkForPaper(css: string, minContrast = INK_CONTRAST): string {
  const rgb = parseHex(css);
  if (!rgb) return css;

  const { l: l0, c: c0, h } = rgbToOklch(rgb);

  // Grey in, grey out. A hue that does not exist cannot be preserved, and
  // saturating the rounding error in a near-neutral would invent a colour.
  if (c0 < 0.01) {
    const dark = contrastOnWhite(rgb) >= minContrast ? rgb : { r: 0.13, g: 0.13, b: 0.13 };
    return toHex(dark);
  }

  // How saturated this colour is for its own hue and lightness, as a fraction
  // of everything sRGB could have given it. That fraction is the thing carried
  // across to paper, because it is what the eye reads as "how colourful is
  // this" independently of how light it happens to be.
  // The chroma it had, plus the lift, and then whatever the gamut will take.
  //
  // Carrying the absolute number across rather than a fraction is what makes
  // this come out right at both ends, and it does so for the same reason in
  // each case. A pale yellow is pale in a band where sRGB has almost no chroma
  // to give once it darkens, so the clamp bites and the ink lands at the most
  // saturated gold available — which reads yellow. A near-grey blue is near-grey
  // in a band with chroma to spare, so the clamp never bites and it stays the
  // quiet colour it was chosen to be.
  const want = c0 * (1 + LIFT);
  const at = (l: number): Rgb =>
    oklchToRgb({ l, c: Math.min(want, maxChroma(l, h) * CEILING), h });

  // The brightest version that still clears the floor. Searching downward from
  // the screen lightness rather than jumping to a fixed target is the whole
  // point: a colour that already reads on white keeps the lightness it had, and
  // one that does not gives up the least it can get away with.
  if (contrastOnWhite(at(l0)) >= minContrast) return toHex(at(l0));

  let lo = 0.15;
  let hi = l0;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (contrastOnWhite(at(mid)) >= minContrast) lo = mid;
    else hi = mid;
  }
  return toHex(at(lo));
}
