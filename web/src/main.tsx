import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import './design/tokens.css';
import './styles/app.css';
import { SoraProvider } from './state/store';
import App from './App';
import Landing from './landing/Landing';
const Styleguide = lazy(() => import('./styleguide/Styleguide')); // internal page; kept out of the main bundle

/* Routes: "/" Landing v2, "/app" the map app (App v4), "/styleguide" the design system. */
const route = /^\/app\/?$/.test(location.pathname) ? 'app' : /^\/styleguide\/?$/.test(location.pathname) ? 'styleguide' : 'landing';
document.documentElement.classList.add('route-' + route);
if (route === 'app') document.title = 'sora — map';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {route === 'app' ? (
      <SoraProvider>
        <App />
      </SoraProvider>
    ) : route === 'styleguide' ? (
      <Suspense fallback={null}><Styleguide /></Suspense>
    ) : (
      <Landing />
    )}
  </StrictMode>,
);
