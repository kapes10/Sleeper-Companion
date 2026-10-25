import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { ErrorBoundary } from './components/ui';
import { createServices, ServicesProvider } from './services';
import './index.css';

registerSW({
  immediate: true,
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
