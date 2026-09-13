import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PlayEditor } from './editor/PlayEditor';
import './ui/tokens.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PlayEditor />
  </StrictMode>,
);

// Firebase is dynamically imported so it stays out of the first chunk. The
// editor is usable before auth resolves, and stage 1 persists nothing yet.
void import('./firebase')
  .then((m) => m.ensureSignedIn())
  .catch((err) => console.warn('anon sign-in deferred:', err));
