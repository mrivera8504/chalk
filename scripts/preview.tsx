import { renderToStaticMarkup } from 'react-dom/server';
import { writeFileSync } from 'node:fs';
import { computeHoles } from '../src/domain/holes';
import { applyOnLine } from '../src/domain/legality';
import { defaultDefense, defaultOffense } from '../src/domain/presets/formations';
import { DEFAULT_SETTINGS } from '../src/domain/types';
import { Field } from '../src/render/Field';
import { PlayerShape } from '../src/render/PlayerShape';
import { VIEW_BOX } from '../src/render/geometry';

const TOKENS: Record<string, string> = {
  '--turf': '#1e3a2b',
  '--turf-line': 'rgba(232,237,233,0.22)',
  '--los': 'rgba(232,237,233,0.62)',
  '--hole': 'rgba(232,237,233,0.5)',
  '--off-fill': '#e8ede9',
  '--off-line': '#10161a',
  '--off-text': '#10161a',
  '--def-fill': 'rgba(16,22,26,0.55)',
  '--def-line': '#ff9b7a',
  '--def-text': '#ffd9cc',
  '--select': '#4fb8ff',
  '--locked': '#f2c14e',
};

/** librsvg's custom-property support is patchy, so resolve them ourselves. */
function resolveVars(svg: string): string {
  return svg.replace(/var\((--[a-z-]+)\)/g, (_, name) => TOKENS[name] ?? '#f0f');
}

const withDefense = process.argv.includes('--defense');
const settings = DEFAULT_SETTINGS;
const players = applyOnLine(
  withDefense ? [...defaultOffense(), ...defaultDefense()] : defaultOffense(),
  settings,
);
const holes = computeHoles(players, settings);

const markup = renderToStaticMarkup(
  <svg xmlns="http://www.w3.org/2000/svg" viewBox={VIEW_BOX} width={620} height={827}>
    <Field
      holes={holes}
      showHoles
      occupied={players
        .filter((p) => p.side === 'offense' && !p.onLine && p.y > 0 && p.y < 2.6)
        .map((p) => p.x)}
    />
    {players.map((p) => (
      <PlayerShape key={p.id} player={p} selected={false} onPointerDown={() => {}} />
    ))}
  </svg>,
);

const out = process.argv.includes('--defense') ? 'preview-defense' : 'preview-offense';
writeFileSync(`${out}.svg`, resolveVars(markup));
console.log(`wrote ${out}.svg`);
