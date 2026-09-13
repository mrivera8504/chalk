import { renderToStaticMarkup } from 'react-dom/server';
import { writeFileSync } from 'node:fs';
import { computeHoles } from '../src/domain/holes';
import { applyOnLine } from '../src/domain/legality';
import { makeBlock } from '../src/domain/presets/blocks';
import { defaultDefense, defaultOffense } from '../src/domain/presets/formations';
import { DEFAULT_SETTINGS, type Assignment, type BlockKind, type PlayerSlot } from '../src/domain/types';
import { AssignmentPath } from '../src/render/AssignmentPath';
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
  '--ink-block': '#f2dfa0',
  '--ink-route': '#7fd4ff',
  '--ink-carry': '#ffb37a',
  '--ink-motion': '#b9a8ff',
  '--ink-option': '#9fb4bf',
};

/** librsvg's custom-property support is patchy, so resolve them ourselves. */
function resolveVars(svg: string): string {
  return svg.replace(/var\((--[a-z-]+)\)/g, (_, name) => TOKENS[name] ?? '#f0f');
}

const withBlocks = process.argv.includes('--blocks');
const withDefense = withBlocks || process.argv.includes('--defense');
const settings = DEFAULT_SETTINGS;
const players = applyOnLine(
  withDefense ? [...defaultOffense(), ...defaultDefense()] : defaultOffense(),
  settings,
);
const holes = computeHoles(players, settings);

/**
 * One of each shape the block tool makes: a short base block against a man
 * head-up, a long one out at a linebacker, a guard pulling across, and a combo
 * that caps the down lineman before climbing.
 */
function sampleBlocks(): Assignment[] {
  const at = (label: string, side: 'offense' | 'defense', x: number): PlayerSlot => {
    const hit = players.find(
      (p) => p.side === side && p.label === label && Math.abs(p.x - x) < 0.01,
    );
    if (!hit) throw new Error(`no ${side} ${label} at ${x}`);
    return hit;
  };

  const pairs: [BlockKind, PlayerSlot, PlayerSlot, PlayerSlot?][] = [
    // head-up, the tightest case the cap geometry has to survive
    ['block', at('C', 'offense', 0), at('T', 'defense', -1.2)],
    ['block', at('TE', 'offense', 3.6), at('E', 'defense', 3.4)],
    // long, out at a linebacker
    ['block', at('WB', 'offense', -5), at('W', 'defense', -2.6)],
    // short pull, where a fixed exit distance used to kink backwards
    ['pull', at('LG', 'offense', -1.8), at('E', 'defense', -3.4)],
    ['combo', at('RG', 'offense', 1.8), at('T', 'defense', 1.2), at('M', 'defense', 2.6)],
  ];

  return pairs.map(([kind, blocker, target, climb]) =>
    makeBlock(kind, blocker, target, climb),
  );
}

const assignments = withBlocks ? sampleBlocks() : [];

const markup = renderToStaticMarkup(
  <svg xmlns="http://www.w3.org/2000/svg" viewBox={VIEW_BOX} width={620} height={827}>
    <Field
      holes={holes}
      showHoles
      occupied={players
        .filter((p) => p.side === 'offense' && !p.onLine && p.y > 0 && p.y < 2.6)
        .map((p) => p.x)}
    />
    {assignments.map((a) => (
      <AssignmentPath key={a.id} assignment={a} />
    ))}
    {players.map((p) => (
      <PlayerShape key={p.id} player={p} selected={false} />
    ))}
  </svg>,
);

const out = withBlocks ? 'preview-blocks' : withDefense ? 'preview-defense' : 'preview-offense';
writeFileSync(`${out}.svg`, resolveVars(markup));
console.log(`wrote ${out}.svg`);
