import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './design/tokens.css';
import './styles/app.css';
import { SoraProvider } from './state/store';
import App from './App';
import Landing from './landing/Landing';

/* Two routes: "/" is Landing v2, "/app" is the map app (App v4). */
const isApp = /^\/app\/?$/.test(location.pathname);
document.documentElement.classList.add(isApp ? 'route-app' : 'route-landing');
if (isApp) document.title = 'sora — map';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isApp ? (
      <SoraProvider>
        <App />
      </SoraProvider>
    ) : (
      <Landing />
    )}
  </StrictMode>,
);
