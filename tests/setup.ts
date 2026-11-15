import { readFileSync } from 'node:fs';
import { beforeEach } from 'vitest';

/**
 * The board's tokens, written onto the root the way the browser would have
 * them. jsdom does not run the cascade for a stylesheet's custom properties,
 * and the exporter reads every token off the computed root — so without this a
 * golden sheet would be a list of empty values and would pass whatever changed.
 */
const css = readFileSync('src/ui/tokens.css', 'utf8');
const root = css.slice(css.indexOf(':root {') + 7, css.indexOf('\n}'));
const TOKENS: [string, string][] = [];
for (const m of root.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
  TOKENS.push([m[1], m[2].trim()]);
}

beforeEach(() => {
  localStorage.clear();
  for (const [k, v] of TOKENS) document.documentElement.style.setProperty(k, v);
});
