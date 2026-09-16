import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './ui/tokens.css';
import { installPenTaps } from './ui/penTaps';
import { watchForUpdates } from './store/update';

// First line in the console on every device, so "which bundle is this one
// running" is a glance rather than an afternoon.
console.info(`Chalk build ${__BUILD__}`);

// Before anything renders, so the first tap on the first button already works.
installPenTaps();

// Registers the worker, then keeps asking whether it is still the current one
// — which a device that is never closed would otherwise never find out.
watchForUpdates();

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
