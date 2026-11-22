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
| --text-primary / secondary / tertiary | #EEF0F3 / #A9ADB6 / #878B95 | #14161A / #474C55 / #5F646E | Values / body / meta (all ≥4.5:1) | Tertiary for essential copy |
| --brand | #3B7BFF | #2563EB | Primary CTA, selected, recommended | Tints on panels, warnings |
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
Mono uppercase labels: 12px, letter-spacing .06–.08em.

## Space, grid, radius, motion
- Spacing: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 96. Landing section rhythm clamp(96–176px).
- Grid: 4 col/16 gutter <768 · 8/20 768–1023 · 12/24 ≥1024. Max 1200 (app) / 1280 (landing v2). App panel 360–500.
- Breakpoints used: 768 (sheet), 900 (nav/search), 1040–1100 (stack), 1180 (tabs in bar).
- Radius: xs 4 · sm 6 · md 8 · lg 12 · xl 16 · pill 999 (v2 CTAs are pills).
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
- **Option card**: route swatch, letter, label, Recommended tag, dose + range, pills, meter.
- **Pareto mini-chart**, **Explanation block** (why / benefit / cost / confidence / caveats), **Data-status badge** L0–L7, **Coverage indicator** (3 bars), **Event card**, **Mode / building / departure-window pickers**, **Legend**, **Time scrubber** (play, sparkline + band, range), **Exposure timeline** (hourly stacks + segment strip), **Proactive card**, **What-if chips + answer card**, **Disclaimer** "Estimates, not measurements. Lower exposure doesn't mean safe."

## Map
Basemap: CARTO `dark_nolabels` / `light_nolabels` with `*_only_labels` on top at 70%, attribution "© OpenStreetMap contributors · © CARTO" (free tier; check CARTO's terms before commercial launch). Field: hex bins ≈1.2 km, 14% gap; coverage <5% → --hex-empty. Uncertainty mode recolours hexes on --unc ramp and swaps the legend. Markers: start ring, end square, station diamond, fire chip, wind arrows (length ∝ speed). Click → dashed crosshairs + popover "PM2.5 ~142 µg/m³ (110–181) · category · confidence"; outside bbox → "Outside the covered area".

## Copy rules
IST 24h ("18:15"), µg for dose, µg/m³ for concentration, ranges always. Never "safe", "healthy", "toxic". Use "estimated", "predicted", "about", "lower", "higher". Say plainly when options aren't reliably different.
