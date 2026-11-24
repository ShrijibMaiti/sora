# Sora web

React + TypeScript + Vite build of the Claude Design prototypes:

- `/` – **Landing v2** (`Sora Landing v2.dc.html`): editorial landing page with the exploded-layer hero, live `plan.sora` preview, steps, FAQ.
- `/app` – **App v4** (`Sora App v4.dc.html`): full-screen map with a floating rail and slide-over panel (bottom sheet + tab bar under 768px).

"Launch Sora" opens `/app`; the sora logo in the app returns to `/`.

```
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build
```

- `src/design/tokens.css` – design tokens (source of truth, see `DESIGN.md`)
- `src/api/` – API layer for [`docs/api_contract.md`](../docs/api_contract.md): `types.ts` (wire types), `client.ts` (fetch + wire→view), `mock.ts` (in-browser backend)
- `src/data/sora.ts` – deterministic Delhi model behind the mock; also illustrative content for the landing page and styleguide
- `src/lib/field.ts`, `src/lib/time.ts` – reading values out of `/api/field`, IST time helpers
- `src/state/store.tsx` – app state, API loading, plan runner, demo states, theme, onboarding

### Mock vs real backend

`npm run dev` uses the in-browser mock; production builds (`npm run build`) call the real `/api`, which FastAPI serves from the same origin (see the root README). To call the FastAPI backend on `:8000` from dev (Vite forwards `/api` in `dev` and `preview`):

```
VITE_USE_MOCK=false npm run dev                                  # macOS/Linux
$env:VITE_USE_MOCK='false'; npm run dev                          # PowerShell
```

If the backend is down the app shows "Can't reach Sora" instead of falling back to fake data.
- `src/lib/layout.ts` – rail/panel/overlay geometry per viewport
- `src/components/` – rail, map (Leaflet), map chrome, side panel sections, overlays, insights
- `src/landing/` – Landing v2 page and its stylesheet

App deep links: `/app#tab=trip|day|whatif|insights&city=delhi`. Preview states live in the profile menu.

Routes: `/` landing, `/app` app, `/styleguide` design system. `npm run build` copies `index.html` into `dist/app/` and `dist/styleguide/` (`scripts/spa-routes.mjs`), so any static host serves them without SPA-fallback config. Add new routes there and in `src/main.tsx`.
