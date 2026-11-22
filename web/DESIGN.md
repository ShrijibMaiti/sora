# Sora design system

Source of truth for tokens: `web/src/design/tokens.css`. Live reference: `/styleguide` (`src/styleguide/Styleguide.tsx`, ported from `Sora Design System.dc.html`).

## Reading of the reference (Urban Sound dashboard)
1. Graphite layers, no shadows — depth = 4 near-black surface steps + 1px hairlines.
2. One electric blue — brand, primary action, selected, recommended. Nothing else.
3. The hexagon is the unit of data — gapped hex bins; no-data = dim grey hex.
4. Measure, then annotate — dashed crosshairs + dark floating readout with close ×.
5. Light numerals, small labels — 300-weight figures, 11–13px labels.
6. Segments and thin lines — probability = 20-bar meter; series = 1.5px line + pill tooltip.
7. Quiet chrome — radii 8/12, status dots, tiny count badges.

Landing v2 adds an editorial structure (after the Stratum reference): lowercase wordmark, 3-line stacked display headline, exploded layer diagram with lifecycle tabs, definition + live preview panel, numbered list with sticky intro, tabbed steps, open FAQ list, centred final CTA, one-line footer.

## Colour
| Token | Dark | Light | Use | Don't |
|---|---|---|---|---|
| --bg-canvas | #121316 | #E8EAEE | Page behind panels | Put text directly on it at <13px |
| --surface-base | #1A1B1E | #F5F6F8 | Panels, cards | Nest base in base |
| --surface-raised | #212226 | #FFFFFF | Controls, nested rows | Use for page bg |
| --surface-overlay | #2A2B30 | #FFFFFF | Popover, menu, sheet | Use without --shadow-overlay |
| --surface-sunken | #161719 | #ECEEF2 | Inputs, tracks | — |
| --border-default / -strong | #2E3035 / #3D4047 | #DCDFE5 / #C3C8D0 | Hairlines / hover, dividers | 2px borders |
| --text-primary / secondary / tertiary | #EEF0F3 / #A9ADB6 / #969AA3 | #14161A / #474C55 / #5F646E | Values / body / meta (all ≥4.5:1) | Tertiary for essential copy |
| --brand | #2F6AE6 | #2563EB | Primary CTA, selected, recommended | Tints on panels, warnings |
| --focus-ring | #8FB3FF | #2563EB | 2px outline, 2px offset | Remove outlines |
| --info / success / warning / danger | #6A9BFF / #3CCF7A / #F2B347 / #FF6B6B | #2563EB / #0F7A43 / #9A5B00 / #C62828 | Status only; pair with icon + text | Encode AQI |

### Data colour (separate from brand)
- **AQI (CPCB, fixed)**: Good #00B050 · Satisfactory #92D050 · Moderately polluted #FFFF00 · Poor #FF9900 · Very poor #FF0000 · Severe #C00000. Ink #0B0C0E on all except Severe (#FFF). Always shown with the text label. Map fill at --field-opacity (.36 dark / .34 light).
- **Uncertainty (sequential)**: --unc-1…8, #E8F0FF → #1A3A8F. Uncertainty overlay only.
- **Routes**: Your plan --route-plan dashed 7/6, 3px · A --route-a solid 4px · B --route-b solid 5px (recommended) · C --route-c dotted 1/7, 4px. Every route gets a --route-halo outline (+4px). Unselected at 55% opacity.
- **Microenvironments**: --me-home, -road, -vehicle, -metro, -work, -gym, -restaurant. Avoid the AQI green–red axis.

## Typography
Geist (UI) + Geist Mono (ranges, times, codes). Tabular numerals on every figure.
| Style | Size / weight / line-height |
|---|---|
| display | clamp(48–108px) / 400 / .94, -0.045em (v2) · clamp(40–76) / 300 (v1) |
| h1 / h2 | clamp(30–44) / 400 / 1.1 · clamp(36–64) / 400 / 1.0 (v2 sections) |
| h3 / h4 | 20 / 500 / 1.3 · 16 / 500 / 1.35 |
| body / small / label | 15–16 / 400 / 1.55 · 13 / 400 / 1.45 · 12 / 500 / 1.3 |
| numeric | 26–56 / 300, ranges in mono 12 `(121–180)` |

Components use the `--fs-*` scale in tokens.css, never raw px: nano 10 · micro 11 · label 12 · small 13 · ui 14 · body 15 · h4 16 · lead 17 · lede 18 · h3 20 · h3-lg 22 · num-md 34 · num-lg 36 · num-2xl 44 · num-3xl 56 (plus the clamp() display/h1/h2 sizes). Colours likewise come from tokens; the Leaflet canvas resolves `--aqi-*` / `--unc-*` with getComputedStyle per theme.
Section and field labels: plain sans 12/500 in --text-secondary (no mono-uppercase kickers, no numbered eyebrows). Mono is for values only: times, ranges, coordinates. Tracking comes from --tr-* (display -.045 · h1 -.035 · h2 -.02 · h3 -.01 · label .06em).

## Space, grid, radius, motion
- Spacing: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 96. Landing section rhythm clamp(96–176px).
- Grid: 4 col/16 gutter <768 · 8/20 768–1023 · 12/24 ≥1024. Max 1200 (app) / 1280 (landing v2). App panel clamp(380, 30vw, 460) · Day clamp(440, 36vw, 540), padding 28. New spacing uses --space-* tokens.
- Breakpoints used: 768 (sheet), 900 (nav/search), 1040–1100 (stack), 1180 (tabs in bar).
- Radius: xs 4 · sm 6 · md 8 · lg 12 · xl 16 · pill 999. Controls use 8/12 (rule 7); App v4 floating surfaces (rail, panel card, bottom sheet) use 24, and buttons, chips and search are pills.
- Motion: instant 80 · fast 140 · base 220 · slow 360 · field 900 ms; ease-standard .2,0,0,1. Reduced motion → all 0ms, field steps hourly, autoplay off.

## Iconography
Lucide line set re-stroked to 1.6 on a 24 grid; sizes 14/16/20. Custom: two-wheeler, auto-rickshaw, hexmark. Icons never stand alone without a text label or aria-label.

## Components (variants · states)
All interactive components: default, hover, focus-visible, active, disabled, loading; data components also empty + error. Hit targets ≥44px on touch.
- **Button** primary / secondary / ghost / icon · sm 32, md 40, lg 48. Do: one primary per view. Don't: blue secondary.
- **Inputs**: text, number + unit suffix, time (IST label), select (custom chevron), combobox (place search, "click the map" row), range (accent-color brand).
- **Segmented, tabs, toggle, checkbox, radio, chips, badges, tooltip, popover, modal, bottom sheet (snaps 120 / 50% / 90%), toast, inline alert, banner, skeleton, progress, spinner, avatar, menu, breadcrumbs, table, list rows, accordion, stepper.**
- **AQI badge**: coloured value chip + category text. **Pollutant chip**: swatch + name + value.
- **Interval bar**: median tick + 90% band + text "148 µg (121–180)" — readable without colour.
- **Confidence meter**: 20 segments, dashed 70% threshold; blue + "Reliably lower" ≥70%, grey + "Not reliably lower" below.
- **Reduction pill** "−28% (−15 to −37)" (success only when reliable) · **Extra-time pill** "+7 min".
- **Option row** (not a card): three lines (letter · label · Recommended tag / leave · +min · reduction / meter + confidence) with dose + range on the right; Your plan has no meter. The recommended row carries its one-sentence reason directly beneath it.
- **Pareto mini-chart**, **Explanation block** (why / benefit / cost / confidence / caveats), **Data-status badge** L0–L7, **Coverage indicator** (3 bars), **Event card**, **Mode / building / departure-window pickers**, **Legend**, **Time scrubber** (play, sparkline + band, range), **Exposure timeline** (hourly stacks + segment strip), **Proactive card**, **What-if chips + answer card**, **Disclaimer** "Estimates, not measurements. Lower exposure doesn't mean safe."

## Map
Basemap: OpenStreetMap raster tiles restyled by the .sora-tiles CSS filter (dark: grayscale + invert + brightness .6; light: grayscale), attribution "© OpenStreetMap contributors". CARTO now watermarks keyless requests, so it was dropped; tile.openstreetmap.org is for light use, so move to a keyed provider before public launch. Field opacity --field-opacity, halved on Trip and What if so routes lead. Field: hex bins ≈1.2 km, 14% gap; coverage <5% → --hex-empty. Uncertainty mode recolours hexes on --unc ramp and swaps the legend. Markers: start ring, end square, station diamond, fire chip, wind arrows (length ∝ speed). Click → dashed crosshairs + popover "PM2.5 ~142 µg/m³ (110–181) · category · confidence"; outside bbox → "Outside the covered area".

## App v4 layout (Google-Maps model)
- **Rail** (left, 72px, radius 24, inset 12, z 1200): logo, ☰ panel toggle, five sections (Live, Trip, Day, What if, Insights) as icon + short label, blue pill on the current one (`aria-current="page"`), theme + profile at the bottom. Mobile: bottom tab bar.
- **Panel** (floating card, radius 24, z 900, `--surface-base`): opens on demand with slide + scale + fade. **Answer-first**: the h1 states the result ("Delhi: moderately polluted air", "Leave at 17:20 by the balanced route", "Your day: about 28% less exposure"), a numeric sub-line carries median + range + confidence; no kicker or slogan above it. Sub-views are a pressed-button group, not ARIA tabs. Trip ends on an action (Remind me / Change trip).
- **Floating chrome** (z 1000): search pill (52px) + city pill; one wrapping chip row ordered status first: AQI chip, active event, pollutant select pill, one "Data: good · 15:00" chip that opens forecast time / source / coverage. Chips are hairline-bordered, no per-chip shadow.
- **Right stack**: legend (top), Layers, recenter, zoom (bottom). **Time bar**: play, time readout, neutral sparkline + band, day labels pinned at their midnight ticks, themed 2px track.
- **Blocking dialogs** (offline, city not built) sit at z 1250 above rail and panel, take focus on open, trap Tab, and keep the API path in a collapsed Details line.

## Colour roles (one blue)
Blue (--brand / --route-b) means only: brand mark, the one primary action per view, the current section, the selected control, and the **recommended** option. `--brand` is #2F6AE6 in dark (white text 4.86:1; hover/press go darker, never lighter). Blue used as text or as a small mark on dark surfaces uses the lighter `--brand-text` (#7AA5FF dark / #1D55D6 light). **Honest states:** `recOf()` (data/sora.ts) is the single source for "recommended": none when the plan isn't reliable, and never a departure that has already left. With no recommendation every option route is `--route-neutral` (told apart by dash), rows read "not reliably different", meters stay grey and nothing is green. Offline, the Data chip reads "Offline · last HH:MM". Route colour follows `recommended` (routeToken in data/sora.ts); the other options take teal then purple; Your plan stays neutral. Chart series, the Day route, today's bar and microenvironment "work" are neutral greys.

## Copy rules
IST 24h ("18:15"), µg for dose, µg/m³ for concentration, ranges always. Never "safe", "healthy", "toxic". Use "estimated", "predicted", "about", "lower", "higher". Say plainly when options aren't reliably different.
