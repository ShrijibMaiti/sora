// Copy dist/index.html into each route folder so /app and /styleguide load on any
// static host without SPA-fallback config. Keep in sync with the routes in src/main.tsx.
import { copyFileSync, mkdirSync } from 'node:fs';

for (const route of ['app', 'styleguide']) {
  mkdirSync(`dist/${route}`, { recursive: true });
  copyFileSync('dist/index.html', `dist/${route}/index.html`);
}
