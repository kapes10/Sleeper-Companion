import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { ErrorBoundary } from './components/ui';
import { createServices, ServicesProvider } from './services';
import './index.css';

/** While the app stays open, also look for a new version this often. */
const UPDATE_CHECK_MS = 60 * 60 * 1000;

// New deployments: the new service worker activates immediately and the page reloads onto it
// (registerType "autoUpdate"). Home-screen apps often resume without reloading, so also check
// for an update whenever the app comes back to the foreground, and hourly while it's open.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    const check = () => {
      if (navigator.onLine) registration.update().catch(() => {});
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
    setInterval(check, UPDATE_CHECK_MS);
  },
  onRegisterError: (err) => console.error('Service worker registration failed; offline start-up will not work.', err),
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ServicesProvider services={createServices()}>
        <App />
      </ServicesProvider>
    </ErrorBoundary>
  </StrictMode>,
);
