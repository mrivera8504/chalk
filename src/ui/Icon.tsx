/**
 * The app's icons: a few strokes each, drawn here.
 *
 * Inline rather than a font or a library, for the reason nothing else in this
 * app is fetched: it has to open with no signal. And few on purpose. The rule
 * in the editor still holds — a glyph on a button only when the same mark lands
 * on the board — so these are for getting around the app: the navigation, a
 * card's menu, a way back. Every one of them sits beside a word or carries an
 * `aria-label` on its button.
 */
const PATHS = {
  home: 'M3 11l9-7 9 7M5 9.5V20h5v-6h4v6h5V9.5',
  book: 'M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2zM9 3v18',
  team: 'M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5M16 5a3.5 3.5 0 0 1 0 7M18 14.5c2.2.6 3.5 2.4 3.5 5.5',
  print: 'M7 8V3h10v5M5 8h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2M7 14h10v7H7z',
  settings: 'M4 7h10M18 7h2M4 17h2M10 17h10M16 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  plus: 'M12 5v14M5 12h14',
  back: 'M15 5l-7 7 7 7',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  search: 'M11 17.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM16 16l4.5 4.5',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  close: 'M6 6l12 12M18 6L6 18',
  chevron: 'M9 5l7 7-7 7',
  account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6',
  undo: 'M8 5L4 9l4 4M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M16 5l4 4-4 4M20 9H10a6 6 0 0 0 0 12h3',
  pencil: 'M4 20l1-5L16 4l4 4L9 19zM14 6l4 4',
  pan: 'M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3',
  minus: 'M5 12h14',
  tools: 'M4 6h16M4 12h16M4 18h16',
  play: 'M8 5l11 7-11 7z',
  stop: 'M7 7h10v10H7z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      // The dots of the More mark are zero-length strokes, so they need weight.
      strokeWidth={name === 'more' ? 3 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
