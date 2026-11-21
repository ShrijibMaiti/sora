# Sora — Planning Session History

Session date: 2026-11-21. Started in a Claude Code cloud session and was then moved (teleported) to this machine.

**Files from this session (all in `D:\sora\docs`):**

| File | What it is |
|---|---|
| `urban_personal_exposure_digital_twin_plan.md` | The original v1 plan the user uploaded (53 sections) |
| `urban_personal_exposure_digital_twin_master_spec.md` | Master spec v2.0 (before the rename; superseded) |
| `sora_master_spec.md` | **Current master spec v2.1, named Sora. This is the source of truth.** |
| `sora_session_history.md` | This file |

Below is each turn in order: the user's message, then Claude's reply. Tool calls and environment noise are left out.

---

## Turn 1 — Review of the v1 plan

**User:**
> @urban_personal_exposure_digital_twin_plan.md we're building this, go through it

**Claude:**

I read the whole plan. The framing is strong. The plan describes what to build in more detail than it describes the data the build depends on, and a few gaps there could break the demo. My review below is in priority order.

### What's already right
- **Personal exposure is the core idea, not the pollution forecast.** "The map isn't the exposure" is the true differentiator. Most of the forecasting stack could be swapped out without hurting the pitch.
- **The baseline ladder and ablations (§39)** are what make the complex model defensible. Keep them even if you cut model components.
- **Calling it integration work (§44)** and the honesty sections (§47) are correct. Judges and reviewers will reward both.

### Gaps that could break the demo

**1. Spatial resolution is the biggest hole.** Station networks give you a field at kilometre scale. Choosing between routes happens at street scale (10–100 m). If the field comes only from stations plus a GNN, every candidate route through the same area gets nearly the same exposure. Route B would then look better only by noise, and that is the "28% reduction" the demo leads with. You need a **downscaling layer**: land-use regression on OSM features (distance to major roads, road class, traffic proxies, green cover). It adds street-level detail on top of the dynamic background field. The plan doesn't mention this, and it is what makes routing mean anything.

**2. You won't have the ground truth the neural operator and physics loss need.** You only observe values at maybe 10–40 stations. A field-to-field operator trained on interpolated fields learns your interpolation method, not the atmosphere. A PDE-residual physics loss has the same problem, because it needs gradients of a field you never observed. More defensible alternatives:
- Build the physics into the GNN: wind-conditioned directed edges plus a graph advection–diffusion step, with non-negativity enforced.
- Run the neural operator as a **Phase 6 experiment**, trained on gridded reanalysis such as CAMS, rather than putting it on the critical path. If it doesn't beat the GNN, report that.

**3. Time optimization will likely beat route optimization.** In most cities, PM2.5 varies more across hours (rush hour, boundary-layer height) than across parallel routes. Make departure time and mode the main lever in the demo, and treat route as the second lever.

**4. "Confidence: 87%" isn't defined anywhere.** Suggested definition: **P(E_optimized < E_original)**, estimated by sampling from the uncertainty model. For the uncertainty itself, use deep ensembles plus conformal calibration.

**5. Exposure validation is planned as synthetic only.** One low-cost portable PM2.5 sensor carried on 5–10 real trips, compared against model estimates, would put you ahead of most competition entries.

### Lower-risk components
- **Indoor:** mass-balance infiltration model, C_in = (P·a / (a + k))·C_out, with infiltration factor by building type; in-vehicle factors per mode.
- **Ventilation:** breathing rates by activity from the US EPA Exposure Factors Handbook.
- **Routing:** time-dependent Dijkstra/A* with an exposure edge cost and a weighted sweep for the Pareto front. The schedule problem is small enough for dynamic programming or enumeration; no RL needed.
- **Personalization and closed loop:** cut for the competition, or show with mock data.

### Suggested build order
1. Data: stations, weather, OSM road graph. One city, PM2.5, hourly.
2. Forecasting baselines (persistence, XGBoost, LSTM), leave-one-station-out CV.
3. Downscaling (land-use regression) → street-level field.
4. Exposure engine: trajectory → microenvironment → ventilation → integral.
5. Optimizer: time, then route, then schedule. Working MVP.
6. Wind-conditioned GNN + physics, ensemble + conformal uncertainty.
7. Demo UI: animated field with trajectory, plan comparison.
8. Neural operator experiment if time remains.

### Decisions needed
City; deadline and team size; judging criteria; compute (GPU or CPU only).

---

## Turn 2 — "We're doing the neural operator. I need the right path, not the easy one."

**User:**
> "Run the neural operator as a Phase 6 experiment…" No..we're doing it, how can i've the ground truth the neural operator and physics loss need ?. "Confidence: 87% isn't defined anywhere… use deep ensembles plus conformal calibration…" i don't need the easy path, i ned the right one

**Claude:**

Fair point. Suggesting the operator as a side experiment was scope management, not a scientific objection. Here is the rigorous way to do it, and the full version of the uncertainty work.

### Part 1: Ground truth for the neural operator and the physics loss

You will never have a fully observed concentration field for a real city. No AQ or weather model has one either; FourCastNet, GraphCast and Aurora train on reanalysis and simulation output. Build ground truth in layers.

**Layer A — physical simulators give complete fields**

| Scale | Model | Gives you |
|---|---|---|
| City/regional, 1–3 km | WRF-Chem or CMAQ, driven by ERA5 and an emission inventory (EDGAR, CAMS-GLOB-ANT, local) | Hourly 3-D PM2.5/NO₂ fields with transport and chemistry |
| Street network, 10–100 m | R-LINE or SIRANE/MUNICH, with traffic emissions on the OSM road graph | Street-level concentrations |
| Neighbourhoods, ~1–10 m | PALM-4U (building-resolving LES) | Canyon effects, checks the street model |

Run an **ensemble** varying meteorology, emissions and boundary conditions → thousands of input→field pairs. The operator learns the solution operator of the transport physics, not an interpolation method.

**Layer B — observations correct the simulator** through observation operators H: reference stations (point sample), satellites (TROPOMI NO₂, MAIAC AOD, GEMS; column integral with averaging kernel; learned AOD→surface PM link conditioned on boundary-layer height), low-cost sensors (point sample + bias + humidity correction, calibrated by co-location).

**Layer C — own dense measurement campaign:** mobile monitoring à la Apte et al. 2017; calibrated PM2.5/NO₂ sensors on a vehicle or bicycle, repeated loops for weeks.

**Training:**
1. Pretrain the operator on the simulation ensemble (dense full-field loss).
2. Fine-tune on reality with a data-assimilation-style objective:

$$\mathcal{L} = \sum_k \| H_k(\hat C) - y_k \|^2_{R_k^{-1}} + \lambda_p \| \mathcal{R}(\hat C) \|^2 + \lambda_s \|\hat S - S_{\text{prior}}\|^2_{B^{-1}}$$

The physics loss needs no labels (PINO). The residual needs the coefficient fields, all available:

$$\mathcal{R}(C) = \partial_t C + \mathbf{u}\cdot\nabla C - \nabla\cdot(K\nabla C) - \tfrac{1}{h}\tfrac{dh}{dt}\,C\,\mathbb{1}_{dh/dt>0} - S + \Lambda C$$

u from ERA5/WRF (mass-consistent downscaling); K from stability; **h = boundary-layer height (missing from the original PDE, dominant control on urban PM)**; S emission prior; Λ deposition + wet scavenging.

3. **Chemistry as a learned closure:** S = S_known + S_θ(C, T, RH, …).
4. **Emissions as an inferred quantity** (inverse problem; corrected emission map is a research output).

**Architecture implied:** Geo-FNO or GNO for the city field; GNN on the street network for street level. Caveat: FNO zero-shot super-resolution can't invent sub-grid physics, which justifies having both.

### Part 2: Uncertainty done properly

**Exposure is a path integral, so it depends on the joint distribution, not the marginals.** Per-cell intervals treated as independent give exposure uncertainty that is far too narrow. The system needs **joint samples of whole space-time fields**.

| Source | How to model it |
|---|---|
| Meteorology | ECMWF ENS members |
| Emissions | Posterior from the inversion |
| Model structure | Deep ensemble of operators |
| Unresolved variability | Conditional generative model (diffusion / flow matching); SPDE/Matérn GP as simpler alternative |
| Observations | Per-instrument error covariance R_k |
| Mobility | Travel-time distributions per edge and time |
| Microenvironment | Priors on infiltration and in-vehicle ratios |
| Ventilation | Breathing-rate distributions |

**Propagation:** nested Monte Carlo → full p(E | plan); Sobol sensitivity analysis.

**Calibration at every level:** CRPS/PIT (marginals); energy score and variogram score (joint structure); exposure coverage against campaign trips; adaptive conformal as an outer layer on the scalar exposure.

**Confidence defined as a decision:**
1. **P(E_opt < E_orig), paired** (common random numbers).
2. Reduction with a credible interval, e.g. "−28% (90% CI −15% to −37%)".
3. Risk-aware optimisation: minimise 𝔼[E] + λ·CVaR_α(E) s.t. P(late) ≤ ε; optionally distributionally robust.
4. Value of information: "This recommendation would flip if PM in the eastern section were 20% higher."

**Costs:** WRF-Chem ensembles need HPC/cloud; PALM needs GPU; mobile campaign needs sensors and weeks; WRF-Chem configuration and inventories are where projects stall.

---

## Turn 3 — Target cities

**User:**
> for now let's target delhi, kolkata, mumbai & chennai

**Claude:** (checked the environment first: all data hosts — OpenAQ, CPCB, Copernicus CDS/ADS, FIRMS, Overpass, UrbanEmissions, GEMS — were blocked by the cloud network policy; container had 4 CPU, 15 GB RAM, no GPU.)

Four cities makes the neural operator easier to defend, not just bigger. They share the same transport physics but differ in winds, boundary-layer behaviour, sources and coastlines. A model that works on a city it was never trained on is exactly what operator learning is meant to do.

| | Delhi | Kolkata | Mumbai | Chennai |
|---|---|---|---|---|
| Setting | Inland IGP | Lower IGP + Bay of Bengal | Coastal peninsula | Coastal, flat |
| Main episodes | Winter inversion; Oct–Nov crop burning; pre-monsoon Thar dust; Diwali | Winter inflow from Gangetic plain; local biomass/coal | Sea-breeze recirculation; construction dust | Bhogi (Jan); north Chennai industry |
| Key physics term | BL dilution, fire source, long-range transport | Upwind inflow | Land–sea breeze; sea salt | Sea breeze; wet scavenging in Oct–Dec NE monsoon |
| Station density | Densest (~40) | Sparse | Moderate | Sparse |
| Local inventory | SAFAR + source apportionment | Weak | SAFAR | Weak |

**Experimental design:** leave-one-city-out; **hold out Kolkata** as the headline split (mirrors deployment to data-poor cities); ablations on the same split; check uncertainty widens over Kolkata gaps and sea-breeze fronts.

**Simulator setup:** one WRF-Chem India parent domain at 27 km, nests 9 → 3 → ~1 km per city (Delhi/Kolkata nests include upwind IGP; Mumbai/Chennai include enough sea). MOZART–MOSAIC + VBS. Emissions: EDGAR-HTAP/CAMS-GLOB-ANT (parent), UrbanEmissions APnA + SAFAR (nests), FINN/GFAS fires, MEGAN, dust module. Boundary conditions: CAMS EAC4. Ensemble periods per city/season; ERA5 ensemble met + log-normal sector scaling.

**Street scale (India):** no open traffic counts → OSM + traffic model + TomTom/HERE speeds; ARAI emission factors; Google Open Buildings 2.5D heights; GEMS likely doesn't cover Mumbai (72.8°E) → INSAT-3D/3DR (MOSDAC); TROPOMI and MAIAC everywhere.

**Exposure (India):** auto-rickshaws, two-wheelers, non-AC buses, Mumbai locals with open doors, underground metro platforms with own PM; naturally ventilated buildings (I/O ratio near 1); indoor sources (cooking, incense, mosquito coils).

**Mobile campaign:** full campaign in one city (Delhi or Kolkata), short calibration campaigns elsewhere.

**Blockers:** network allowlist for data hosts; compute (HPC for WRF-Chem, GPU for operator training).

---

## Turn 4 — Write the master specification

**User:** Pasted the Turn 3 reply back and attached a detailed brief for maintaining the master planning document. The brief's 28 sections required:

1. Preserve the complete existing vision (environmental state / human state / decision layer).
2. Preserve the research architecture.
3. Justify every advanced component (problem, why simpler fails, math structure, input, output, connection, evaluation).
4. Add remaining features (environmental, exposure, mobility intelligence).
5. Indoor/outdoor as a first-class feature.
6. Personal digital twin.
7. Proactive vs reactive assistance.
8. Explainability.
9. Uncertainty propagation end to end.
10. Robust optimization.
11. Multi-objective optimization (Pareto options).
12. Counterfactual reasoning.
13. Event-awareness.
14. Hierarchical spatial resolution.
15. Computational architecture (offline / near-real-time / on-device).
16. Scalability.
17. Ablation studies.
18. Failure modes (failure → detection → mitigation → user-facing behaviour).
19. Graceful degradation.
20. Competition-focused layer (research vs MVP vs future).
21. Feature matrix.
22. Architecture decision log.
23. "Do not overengineer" rule.
24. Synchronized mathematical formulation.
25. Simple final product experience.
26. Documentation rules.
27. Required 52-section document structure.
28. Final instruction: audit, integrate, preserve, resolve contradictions, update diagrams/equations/matrix/roadmap; this document is the source of truth.

**Claude:** Wrote master spec v2.0 (2,827 lines, all 52 sections) → now `urban_personal_exposure_digital_twin_master_spec.md`.

- **Nothing from v1 was dropped.** Appendix A maps all 53 v1 sections; "What makes this different" and "Why this is a difficult problem" restored as §5.4 and §2.4.
- **Integrated:** everything in the brief, plus the three discussion rounds (ground-truth layers; PDE with boundary-layer dilution, learned chemistry, emission inversion; street layer; joint generative uncertainty; paired confidence; CVaR/robust optimization; four cities with Kolkata held out; India-specific modes and buildings).
- **Calls to check:**
  - Neural operator recorded as a committed core component (ADR-003), still verified by ablation; if it doesn't beat the physics-informed GNN, report that and keep the fallback chain.
  - Operator in the Competition Version, not the MVP. MVP = Delhi, PM2.5, station ML + CAMS + LUR, route + time optimization; it doubles as the system's degradation fallback.
  - "Confidence 87%" = paired probability of improvement; "14.8 units" = inhaled dose in µg. Example numbers are illustrative.
  - Left out: RL (schedule problem solvable exactly), LLM only as optional interface, foundation models deferred — all in the decision log.
- **Flagged "verify":** station counts; GEMS coverage of Mumbai; CPCB AQI breakpoints (from memory); infiltration and breathing-rate ranges (placeholder priors).
- **Open decisions (§46.4):** compute, deadline and judging criteria, team size, campaign city, data agreements (SAFAR, traffic speeds), budget; the cloud environment couldn't reach any data source.

---

## Turn 5 — Naming

**User:**
> We're calling it " Sora "

**Claude:** Renamed the project to Sora throughout; spec is now v2.1 at `sora_master_spec.md` (old file name removed in the cloud copy; both copies exist here).

- Title and document control: "Sora" is the name; "Urban Personal Exposure Digital Twin" kept as the technical description.
- New naming rule (§6.3): Sora names the project, app and assistant; the assistant speaks as Sora in user-facing text; internal components keep technical names.
- Main demo reads "Sora responds…"; one-sentence definition starts "Sora is an Urban Personal Exposure Digital Twin: …".
- Changelog entry for v2.1; decision recorded as ADR-024. No technical content changed.
- **Name clash:** OpenAI's video-generation model is also called Sora. Fine for the competition, but affects search and possibly trademark; ADR-024 lists a name check before any public launch.

---

## Current state and next steps

- **Source of truth:** `sora_master_spec.md` (v2.1). `urban_personal_exposure_digital_twin_master_spec.md` is the pre-rename v2.0 and can be deleted.
- **Nothing is implemented yet.** No repository exists; this folder is not under git.
- **Open decisions blocking dates:** compute access, competition deadline and judging criteria, team size, campaign city (Delhi vs Kolkata), data agreements and budget.
- **Next planned step:** set up the repository with the spec as its first file, then start the Phase 2 data pipeline (CPCB, ERA5/IFS, CAMS, OSM for Delhi).
