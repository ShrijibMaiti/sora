# Sora — Urban Personal Exposure Digital Twin

Source of truth: [`docs/sora_master_spec.md`](docs/sora_master_spec.md). Section numbers (§) below refer to it.
Tiers: **T0** MVP · **T1** Competition · **T2** Research.

## File tree

```text
sora/
├── README.md
├── pyproject.toml                    Python package + deps
├── docs/                             spec, original plan, session history
│
├── configs/
│   ├── cities/{delhi,kolkata,mumbai,chennai}.yaml   bbox, grid, demo area, station list      §3.3
│   ├── sim/wrfchem_namelist.template                India parent + 4 city nests               §17.4  T1
│   ├── sim/ensemble.yaml                            met/emission perturbations, periods       §34.2  T1
│   └── experiments/{baselines,operator,ablations}.yaml                                        §35–36
│
├── sora/                             ── ML + backend (Python) ──
│   ├── config.py · geo.py            constants, projections
│   ├── pipeline.py                   hourly cycle: ingest → QC → assimilate → forecast → samples  §18.2
│   │
│   ├── data/                         L1 ingestion                                              §11
│   │   ├── openmeteo.py              CAMS PM2.5 + ERA5/IFS met (point API)                     T0
│   │   ├── openaq.py · cpcb.py       CAAQMS station PM2.5                                      T0
│   │   ├── qc.py                     range / stuck / spike checks                              §12.4  T0
│   │   ├── osm.py                    road network (Overpass)                                   T0
│   │   ├── era5.py · cams.py         gridded reanalysis (CDS/ADS)                              T1
│   │   ├── satellite.py              TROPOMI NO₂, MAIAC/INSAT AOD, GEMS                        T1
│   │   ├── fires.py                  FIRMS active fires                                        T1
│   │   ├── buildings.py              Open Buildings 2.5D heights                               T1
│   │   ├── traffic.py                speeds + ARAI emission factors                            T1
│   │   ├── inventories.py            EDGAR, APnA, SAFAR, FINN                                  T1
│   │   └── campaign.py               mobile + personal-sensor data, calibration                T1
│   │
│   ├── fusion/                       L2 observation operators H_k, errors R_k                  §12.3  T1
│   │   ├── obs_operators.py · errors.py · lowcost_calibration.py
│   │
│   ├── representation/               L3 hierarchical grid + road graph                          §13
│   │   ├── grid.py · road_graph.py · mapping.py (grid↔graph) · static_features.py · wind_edges.py
│   │
│   ├── field/                        T0 field model                                            §43
│   │   ├── correction.py             station-ML correction of CAMS + GP nowcast                T0
│   │   ├── downscale_lur.py          land-use-regression street increments                     §15.2  T0
│   │   ├── forecast.py               0–72 h fields, horizons                                   §18
│   │   └── aqi.py                    India NAQI (display only)                                 §18.5
│   │
│   ├── physics/                      L4 physics layer                                          §14, §16
│   │   ├── pde.py                    advection–diffusion–BLH residual                          T1
│   │   ├── constraints.py            non-negativity, flux form, BCs                            T1
│   │   ├── closure.py                learned chemistry term                                    T2
│   │   └── inversion.py              emission inversion                                        T2
│   │
│   ├── operator/                     L4 neural operator (ADR-003)                              §17
│   │   ├── fno.py · geofno.py        architectures                                             T1
│   │   ├── assimilation.py           analysis step                                             T1
│   │   ├── rollout.py                autoregressive 0–72 h                                     T1
│   │   └── train.py                  sim pretrain → real fine-tune (data + physics + source)   §34
│   │
│   ├── gnn/                                                                                    §15
│   │   ├── street_gnn.py             flux-form street-canyon GNN                               T1
│   │   ├── station_stgnn.py          station ST-GNN (baselines B4/B5)                          T1
│   │   └── train.py
│   │
│   ├── uncertainty/                  L6 joint samples + calibration                            §19
│   │   ├── ensemble.py               model × met ensembles                                     T0
│   │   ├── gp_sampler.py             separable space-time GP (SPDE baseline)                   T0
│   │   ├── generative.py             diffusion / flow-matching sampler                         T1
│   │   ├── conformal.py              adaptive conformal outer layer                            T1
│   │   ├── coverage.py               observation-coverage index                                T0
│   │   ├── calibration.py            CRPS, PIT, energy/variogram scores                        T1
│   │   └── sobol.py                  variance decomposition                                    T2
│   │
│   ├── sim/                          Layer-A ground truth                                      §11.8, §17.4
│   │   ├── toy_mixed_layer.py        fast 2-D solver for development                           T1
│   │   ├── wrfchem.py · rline.py · sirane.py · palm.py   runners + output readers              T1/T2
│   │   └── ensemble.py               ensemble generation                                       T1
│   │
│   ├── events/                       abnormal-episode detection                                §30    T1
│   │   ├── detect.py (innovations) · attribution.py · calendar.py (Diwali, Bhogi, GRAP)
│   │
│   ├── mobility/                     L7 human trajectory                                       §20
│   │   ├── trajectory.py             planned trajectories                                      T0
│   │   ├── map_matching.py · stay_points.py · mode_inference.py                                T1
│   │   └── travel_time.py            edge travel-time distributions                            T0
│   │
│   ├── exposure/                     L8 personal exposure                                      §21–22
│   │   ├── microenv.py               modes, buildings, priors                                  T0
│   │   ├── indoor.py                 dynamic mass-balance model                                T1
│   │   ├── ventilation.py            activity → breathing rate                                 T0
│   │   ├── dose.py                   path integral on samples                                  T0
│   │   └── attribution.py            per-segment / per-cause                                   T1
│   │
│   ├── decision/                     L9 optimization                                           §23–26, §31
│   │   ├── routing.py                candidate routes (TD multi-criteria)                      T0
│   │   ├── departure.py              departure-time search                                     T0
│   │   ├── schedule.py               whole-day DP / CP-SAT                                     T1
│   │   ├── pareto.py · risk.py       Pareto front, CVaR, DRO                                   T0/T1/T2
│   │   ├── confidence.py             paired P(improvement), CIs                                T0
│   │   ├── counterfactual.py         "what if" engine                                          T1
│   │   └── voi.py                    value of information                                      T2
│   │
│   ├── assistant/                    L10                                                       §28–29
│   │   ├── explain.py                explanation object + templates                            T0
│   │   ├── proactive.py              trigger rule                                              T2
│   │   └── nl_interface.py           optional LLM interface (ADR-014)                          Experimental
│   │
│   ├── personal/                     L11 personal twin (on-device logic)                       §27    T2
│   │   ├── patterns.py · preferences.py · closed_loop.py
│   │
│   ├── baselines/                    B0–B3                                                     §35
│   │   ├── persistence.py · arima.py · tree_models.py · lstm.py
│   │
│   ├── eval/                         metrics, blocked/LOCO splits, ablation runner             §34.6, §36–37
│   │   ├── metrics.py · splits.py · ablations.py
│   │
│   └── api/                          FastAPI backend                                           §41.2
│       ├── main.py · schemas.py
│       └── routes/field.py · plan.py · counterfactual.py · events.py
│
├── scripts/                          CLI entry points
│   ├── build_city.py · run_simulations.py · train_operator.py · train_street_gnn.py
│   └── run_baselines.py · run_ablations.py
│
├── tests/
│   ├── conftest.py
│   └── test_{qc,aqi,physics,operator,uncertainty,dose,decision,api}.py
│
└── web/                              ── Frontend (Vite + React 18 + TypeScript + Leaflet) ──
    ├── package.json · tsconfig.json · vite.config.ts · index.html
    ├── DESIGN.md                                      design system documentation
    ├── README.md                                      run/build, deep links
    └── src/
        ├── main.tsx · App.tsx                         "/" landing, "/app" application
        ├── design/tokens.css                          design tokens (source of truth)
        ├── landing/Landing.tsx · landing.css          landing page + hero
        ├── styles/app.css                             app styles
        ├── state/store.tsx                            app state, plan runner, theme, onboarding
        ├── data/sora.ts                               Delhi mock model + /api/plan stand-in   §7.1
        ├── lib/layout.ts                              rail / panel / overlay geometry
        └── components/
            ├── Chrome.tsx                             top bars / rail                         §7
            ├── MapView.tsx · MapChrome.tsx            Leaflet field map + map controls        §7.4
            ├── SidePanel.tsx · Overlays.tsx           slide-over panel, overlays/states
            ├── Insights.tsx                           exposure history                        §22.6
            ├── Icon.tsx
            └── panels/LivePanel.tsx · TripPanel.tsx · DayPanel.tsx · WhatIfPanel.tsx · shared.tsx
```

## Status

- **Backend/ML:** structure only; files are empty placeholders except the first data modules
  (`config.py`, `geo.py`, `data/openmeteo.py`, `data/openaq.py`, `data/qc.py`, `data/osm.py`) and `pyproject.toml`.
- **Frontend (`web/`):** landing page and app UI built, running on mock data with hardcoded values;
  not yet connected to the backend. `cd web; npm install; npm run dev`.
