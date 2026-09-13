import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './ui/tokens.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Firebase stays out of the first chunk. The playbook reads from local storage
// synchronously, so the app is usable before auth resolves or fails; the store
// pushes to the cloud once it has both a connection and an account.
void import('./firebase')
  .then((m) => m.ensureSignedIn())
  .catch((err) => console.warn('anon sign-in deferred:', err));
