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
- `src/data/sora.ts` – deterministic Delhi mock model + `/api/plan` stand-in (port of `sora-kit.js`)
- `src/state/store.tsx` – app state, plan runner, demo states, theme, onboarding
- `src/lib/layout.ts` – rail/panel/overlay geometry per viewport
- `src/components/` – rail, map (Leaflet), map chrome, side panel sections, overlays, insights
- `src/landing/` – Landing v2 page and its stylesheet

App deep links: `/app#tab=trip|day|whatif|insights&city=delhi`. Preview states live in the profile menu.

The app uses path routing, so a static host must serve `index.html` for `/app` (SPA fallback). `npm run dev` and `npm run preview` already do.
