# Urban Personal Exposure Digital Twin
## Master Specification — Research, Product & Competition Plan

> **Working concept:** A physics-constrained, uncertainty-aware, spatiotemporal urban pollution digital twin that models the evolving pollution field, maps a moving person's exposure through indoor and outdoor microenvironments, and optimizes their future route, timing, and schedule to reduce cumulative pollution exposure.

> **This document is the single source of truth for the project.** Every future feature, model, experiment or product decision is integrated into this architecture (and recorded in the Feature Matrix §47 and the Architecture Decision Log §48) rather than living in a parallel concept.

---

# 0. Document Control

## 0.1 Version

| Field | Value |
|---|---|
| Version | 2.0 |
| Date | 2026-11-21 |
| Supersedes | v1 "Detailed Research & Competition Planning Document" (53 sections) |
| Target cities | Delhi, Kolkata, Mumbai, Chennai |
| Implementation state | **Nothing is implemented yet.** Every component is Planned, Experimental, Research-only or Future. |

## 0.2 Status legend

Used in every section heading table, the Feature Matrix and the ADR log.

| Tag | Meaning |
|---|---|
| **Existing** | Implemented and tested in the repository. (Currently: none.) |
| **Planned** | Committed; in the MVP or Competition Version scope. |
| **Experimental** | Committed to build, but its inclusion in the final system depends on an experiment/ablation outcome. |
| **Research-only** | Part of the Research Version; not required for the competition. |
| **Future** | Scientifically valuable; deliberately deferred. |

Scope tiers: **T0 = MVP**, **T1 = Competition Version**, **T2 = Research Version**, **T3 = Future / Production** (see §43–§45).

## 0.3 How to update this document

1. Read the whole document before changing it.
2. Every new component gets a **Component Card** (§10.4) in its section, a row in the **Feature Matrix** (§47) and an entry in the **ADR log** (§48).
3. Update the **master formulation** (§33) and the **architecture diagrams** (§10, §51) whenever a component's inputs/outputs change.
4. Never silently remove a feature: move it to *Future* (§50) or record its rejection in the ADR log.
5. Record the change in §0.4.

## 0.4 Changelog

### v1 → v2 (this revision)

**Preserved:** every v1 concept. Appendix A maps each of the 53 v1 sections to its location in v2.

**Added (from technical review and planning discussions):**

- Four target cities and a cross-city generalization experiment (leave-one-city-out) as the headline scientific test (§3.3, §4, §36).
- A **ground-truth strategy** for the neural operator and physics loss: simulator ensembles (WRF-Chem, R-LINE/SIRANE, PALM-4U), observation operators for stations/satellites/low-cost sensors, and a dedicated mobile monitoring campaign (§11, §12, §34).
- A corrected transport PDE that includes **boundary-layer (mixing-height) dilution**, wet scavenging and a **learned chemistry closure** (§14, §16).
- **Emission inversion** as part of training (§16.5).
- **Street-scale downscaling** (LUR baseline + street-network GNN) — without it, route choice is not meaningful (§15).
- **Joint (spatially and temporally correlated) uncertainty** via a conditional generative sampler, because exposure is a path integral (§19).
- A concrete definition of **"confidence"**: the paired probability $P(E_{\text{opt}} < E_{\text{orig}})$ plus a credible interval on the reduction (§31.5).
- **Risk-aware and robust optimization** (CVaR, chance constraints, distributionally robust options), multi-objective Pareto presentation (§31).
- A concrete definition of **exposure units** (§22.3).
- **India-specific** mobility modes, microenvironments, AQI (CPCB National AQI), data sources, events (stubble burning, Diwali, Bhogi, dust, GRAP restrictions) (§11, §18.5, §20, §21, §30).
- New sections: System Requirements, Counterfactual Simulation, Proactive Assistant, Explainability, Event Detection, Failure Modes, Graceful Degradation, Deployment Architecture, Scalability, Feature Matrix, ADR log, Open Research Questions.

**Changed (with rationale):**

- The neural operator is a **committed core component** (ADR-003). Its *contribution* is still verified by ablation, as the v1 "complexity must be earned" principle requires.
- Data fusion is done **inside the assimilation/training objective through observation operators**, not by pre-merging sources into one gridded product (ADR-005).
- The v1 phrase "Confidence: 87%" and "14.8 units" are now defined quantities (ADR-011, ADR-021). The numbers in examples remain **illustrative**.
- Math notation changed from `\[ \]` to `$$ $$` so that it renders on GitHub.

**Removed:** nothing.

---

# Guiding Principles

These principles constrain every section below.

### P1 — Complexity must be earned by the problem

> **Do not build complicated AI for the sake of complicated AI. Find the real-world complexity first. Then use the mathematical architecture required to model that complexity.**

If a simpler model performs equally well, prefer it — unless the complex model provides another important advantage: better generalization, better uncertainty, better physical consistency, better spatial resolution, better long-horizon stability, better transfer across cities, or better decision quality. Each such claim must be tested by an ablation (§36).

Do **not** build

```text
CNN + LSTM + Transformer + GNN + PINN + Neural Operator + RL + LLM
```

because they are impressive. That is architecture theater. Instead:

```text
Problem structure  →  Mathematical requirement  →  Appropriate model  →  Ablation proving it helps
```

### P2 — Exposure, not ambient AQI, is the target

The optimization target is the estimated pollutant dose of a specific person along a specific trajectory, not the AQI at a point.

### P3 — Uncertainty is carried end-to-end

Every layer outputs distributions (or samples), not point values. The assistant becomes **less confident, not falsely precise**, when evidence is weak.

### P4 — Decision support, not medical advice

"Low exposure" never becomes "safe". All exposure figures are estimates.

### P5 — Every equation corresponds to a component

No decorative mathematics.

### P6 — Honest positioning

We do not claim that nobody has built the components. We claim a defensible integration and specific testable contributions (§5).

---

# 1. Executive Summary

## 1.1 What we are NOT building

We are explicitly **not** building merely:

- An AQI dashboard
- A weather/AQI application
- A simple AQI forecasting model
- An app that says "AQI is 183, wear a mask"
- A GPS route planner that picks the road with the lowest current AQI
- A generic "AI + AQI + recommendations" application, or an "AQI app + LLM + route planner"
- A system that combines many neural networks simply to appear sophisticated

These either already exist or ignore the deeper scientific structure of urban pollution.

## 1.2 What we ARE building

An **Urban Personal Exposure Digital Twin**:

> The city has a continuously evolving pollution state; the user has a continuously evolving location/activity/microenvironment state. The system learns the interaction between those two states to estimate — with quantified uncertainty — and minimize the user's future cumulative exposure.

```text
URBAN POLLUTION STATE  (environmental state)
          ×
HUMAN MOBILITY / ACTIVITY STATE  (human state)
          ↓
PERSONAL EXPOSURE STATE  (distribution, not a number)
          ↓
RISK-AWARE MULTI-OBJECTIVE OPTIMIZATION  (decision layer)
          ↓
EXPLAINED, CONFIDENCE-RATED ASSISTANCE  (reactive + proactive)
          ↓
FEEDBACK / ADAPTATION
```

Operational pipeline:

```text
Collect → Fuse (assimilate) → Reconstruct → Predict → Quantify uncertainty
→ Estimate personal exposure → Optimize route / time / destination / schedule
→ Explain & recommend → Learn from repeated behavior
```

## 1.3 Where and for whom

Four Indian megacities that represent four distinct pollution regimes — **Delhi** (inland Indo-Gangetic Plain), **Kolkata** (lower IGP + Bay of Bengal, sparse monitoring), **Mumbai** (coastal peninsula, sea breeze) and **Chennai** (coastal, north-east monsoon). Users: commuters, students, outdoor workers, people who exercise outdoors, and people who are more sensitive to pollution (as decision support only).

## 1.4 Headline contributions (testable)

1. **A physics-constrained neural-operator + street-network GNN field model** trained on simulator ensembles and fine-tuned to real observations, evaluated on a **city it was never trained on** (leave-one-city-out).
2. **Joint uncertainty propagated to personal exposure**, with calibration shown at field, joint-structure and exposure level.
3. **Risk-aware whole-day optimization** (route + departure time + destination + mode) with a decision-level confidence: the paired probability that the optimized plan actually yields lower exposure.
4. **Indoor/outdoor and in-vehicle microenvironment modelling for Indian conditions** (naturally ventilated buildings, open-air modes).
5. Validation against **independent street-level and personal measurements** from our own monitoring campaign.

---

# 2. Problem Definition

## 2.1 The air-quality map is not the same thing as a person's exposure

A conventional system asks: *"What is the pollution concentration at this location?"* That is useful but insufficient, because a human does not remain at one fixed point:

```text
HOME → ROAD → COLLEGE → ROAD → GYM → RESTAURANT → HOME
```

Exposure changes continuously with location, time, weather, traffic, wind, pollution transport, activity intensity, indoor/outdoor state, building characteristics, ventilation, duration, transport mode and route choice.

> A city-wide or point-level AQI value is not equivalent to the pollution actually experienced by a moving human.

## 2.2 Traditional vs proposed framing

```text
TRADITIONAL                         PROPOSED
Current location                    Multi-source observations
      ↓                                     ↓
Current AQI                         Dynamic urban pollution field (with uncertainty)
      ↓                                     ↓
Recommendation                      Future pollution field (joint samples)
                                            ↓
                                    User trajectory through the field
                                            ↓
                                    Microenvironment-aware personal exposure
                                            ↓
                                    Risk-aware optimization of future decisions
```

## 2.3 Formal problem statement

Given heterogeneous observations $\mathcal{Y}_{\le t}$ (stations, satellites, sensors), meteorological forecasts and static urban data:

1. **State estimation:** infer $p\big(C(\cdot, t) \mid \mathcal{Y}_{\le t}\big)$ — the posterior over the multi-pollutant concentration field.
2. **Prediction:** infer $p\big(C(\cdot, t{:}t{+}H) \mid \mathcal{Y}_{\le t}\big)$ as **joint** space-time samples.
3. **Exposure:** for any candidate plan $\pi$ (sequence of locations, times, routes, modes, activities), compute $p\big(E(\pi)\big)$ by pushing field samples through the human trajectory, microenvironment and ventilation models.
4. **Decision:** choose $\pi^*$ minimizing a risk-aware multi-objective criterion subject to the user's constraints (§33).

The full formulation is §33.

## 2.4 Why this is a difficult problem

The difficulty comes from multiple **coupled** uncertainties:

```text
Measurement uncertainty
        ↓
Spatial reconstruction uncertainty
        ↓
Future pollution uncertainty
        ↓
Indoor/outdoor uncertainty
        ↓
Mobility uncertainty
        ↓
Activity uncertainty
        ↓
Exposure uncertainty
        ↓
Optimization uncertainty
```

The system is therefore not simply an ML predictor. It is:

> **A decision-making system operating under a partially observed, dynamically evolving physical environment.**

---

# 3. Motivation

## 3.1 Pollution is a spatiotemporal dynamical system

Pollution moves with wind, diffuses, is emitted by traffic and industry, accumulates around buildings and street canyons, is diluted or trapped by the atmospheric boundary layer, is removed by rain and deposition, and transforms chemically. Therefore:

> Concentration at location $x$ and time $t$ depends on the surrounding spatial state and on what happened earlier.

$$
C(x, t+\Delta t) = F\big(C(\cdot, t),\, W(\cdot, t),\, E(\cdot, t),\, R,\, H_{\text{morph}},\, h(t), \dots\big)
$$

where $C$ is the concentration field, $W$ meteorology (wind, temperature, humidity, rain), $E$ emissions, $R$ road/traffic structure, $H_{\text{morph}}$ urban morphology and $h$ the boundary-layer (mixing) height. The objective is not "predict AQI" but **learn how the urban pollution field evolves, and use that to make better personal decisions**.

## 3.2 Why personal exposure differs from ambient concentration

- **Time of day**: in Indian cities, concentrations commonly vary more across hours (rush hour, night-time boundary-layer collapse) than across parallel routes. Departure-time choice is often the largest lever.
- **Mode**: open-air modes (walking, cycling, two-wheeler, auto-rickshaw) differ strongly from enclosed AC vehicles or metro.
- **Microenvironment**: indoor concentration differs from outdoor, but in naturally ventilated Indian buildings often by less than assumed elsewhere.
- **Breathing rate**: a runner inhales several times the air volume of a seated person.

## 3.3 Why these four cities

They share the same transport physics but differ in winds, boundary-layer behaviour, sources, coastline and monitoring density. That makes them a natural test of whether a learned physics-constrained operator **generalizes** — the core justification for operator learning (§17).

| | Delhi | Kolkata | Mumbai | Chennai |
|---|---|---|---|---|
| **Setting** | Inland, Indo-Gangetic Plain (IGP) | Lower IGP + Bay of Bengal | Coastal peninsula | Coastal, flat |
| **Main episodes** | Winter inversion with very shallow nighttime boundary layer; Oct–Nov crop-residue burning transported from Punjab/Haryana; pre-monsoon dust from the Thar desert; Diwali | Winter northwesterlies bring pollution from the whole Gangetic plain; local biomass and coal burning | Sea breeze traps and recirculates pollution in winter; construction dust | Bhogi festival burning (January); industry in north Chennai (Ennore, Manali) |
| **Dominant physics term** | Boundary-layer dilution, fire source, long-range transport | Inflow through upwind boundaries | Land–sea breeze reversing the wind field; sea-salt aerosol | Sea breeze; wet scavenging during Oct–Dec north-east monsoon (rain in *winter*) |
| **Station density** | Densest in India (~40 continuous stations, approx.) | Sparse | Moderate | Sparse |
| **Local inventory** | SAFAR; source-apportionment studies (IIT Kanpur, TERI–ARAI) | Weak | SAFAR | Weak |

*Station counts are approximate and must be verified from the CPCB portal (open item, §46.4).*

---

# 4. Research Question

## 4.1 Central question

> **Can we construct a physics-constrained, uncertainty-aware, spatiotemporal digital twin of urban pollution and use it to minimize an individual's future cumulative exposure under real-world mobility constraints?**

This is much stronger than "Can we predict AQI?" or "Can we find a cleaner route?"

## 4.2 Sub-questions and testable hypotheses

| ID | Question | Hypothesis | Tested in |
|---|---|---|---|
| RQ1 | Does a physics-constrained neural operator generalize to an unseen city better than data-driven baselines? | H1: Operator + physics + closure beats GNN-only and operator-only on leave-one-city-out error, most strongly for the held-out sparse city (Kolkata). | §36 A1–A4 |
| RQ2 | Is street-scale resolution necessary for meaningful route choice? | H2: Without downscaling, between-route exposure differences are within uncertainty; with it, a measurable fraction of route decisions change and are validated by mobile measurements. | §36 A6 |
| RQ3 | Does joint (correlated) uncertainty matter for exposure? | H3: Marginal per-cell intervals give under-covering exposure intervals; joint samples restore nominal coverage. | §36 A7 |
| RQ4 | Which decision lever matters most? | H4: Departure-time optimization yields larger expected reduction than route choice alone in IGP winter; combining both is better than either. | §36 A10–A11 |
| RQ5 | Does risk-aware optimization reduce bad outcomes cheaply? | H5: CVaR-aware plans reduce 90th-percentile exposure with small expected-value or travel-time cost. | §36 A12 |
| RQ6 | Does microenvironment modelling change decisions? | H6: Indoor/outdoor and in-vehicle modelling changes the recommended plan in a non-trivial fraction of scenarios and improves exposure-estimate accuracy against personal sensors. | §36 A8 |
| RQ7 | Can personalization make assistance proactive without loss of accuracy? | H7: Predicted next-day schedules are accurate enough that proactive recommendations deliver most of the benefit of user-specified schedules. | §36 A14 |

---

# 5. Novelty and Positioning

## 5.1 What already exists (we do not claim these)

The literature already contains GPS-based personal exposure estimation; route- and activity-based exposure models; indoor/outdoor infiltration models; GNN-based pollution forecasting; physics-informed GNNs; neural-operator and foundation-model atmospheric forecasting (including air-quality forecasting trained on CAMS data); multi-source data fusion; exposure-aware "clean route" planners; street-level mobile monitoring.

## 5.2 What we claim

An **integration and systems-research contribution**:

> Several currently separate research capabilities are integrated into one operational, uncertainty-aware system that connects dynamic urban pollution prediction directly to personalized exposure minimization.

The specific, defensible claims (each tied to an experiment):

1. **Cross-city operator generalization** across four Indian regimes, with a sparse-data held-out city (RQ1).
2. **End-to-end joint uncertainty** from observation to recommendation, with calibration demonstrated at each level (RQ3).
3. **Decision-level confidence** (paired probability of improvement) and **risk-aware whole-day planning** (RQ4, RQ5).
4. **Indian microenvironment and mode modelling** validated against our own measurements (RQ6).

## 5.3 What we do not claim

- That the system measures anyone's inhaled dose clinically.
- That it is the first exposure-aware router.
- That the neural operator is better than WRF-Chem at simulating chemistry. It is a fast, assimilating emulator, which is what a real-time personal system needs.

## 5.4 What makes this different

The differentiation is not "we have AI". It is:

1. **Pollution as a dynamic field** — not a static AQI number.
2. **Human as a moving agent** — not a fixed location.
3. **Indoor + in-vehicle + outdoor exposure** — not outdoor AQI alone.
4. **Personal exposure rather than ambient pollution** — not "AQI near you = 180" but "your estimated dose along today's trajectory is X".
5. **Future optimization** — not "air quality is bad" but "change your departure time/route/mode to reduce future exposure".
6. **Whole-day optimization** — the entire schedule, not independent routes.
7. **Physics-aware modelling** — constrained by the physical structure of transport and boundary-layer dilution.
8. **Uncertainty-aware recommendations** — the system knows when its prediction is unreliable, and says so.
9. **Personalization** — it learns recurring mobility patterns and the user's trade-offs.
10. **Closed-loop improvement** — predictions and recommendations improve from observed behaviour and measurements.
11. **Cross-city generalization** — tested on a city the model was never trained on.

---

# 6. Product Vision

## 6.1 Product statement

A personal assistant that understands both **the city's air over the coming hours and days** and **the user's day**, and tells them — with honest confidence — how to change when, where and how they travel and spend time to breathe less pollution, at a cost they choose.

## 6.2 Modes

| Mode | Trigger | Example |
|---|---|---|
| **Reactive** | The user asks | "What's the cleanest way to college?" / "What if I take the metro?" |
| **Proactive** | The system predicts the user's routine and a forecast with meaningful, confident benefit | "You usually leave for college at 8:15. Tomorrow 8:00–9:00 is predicted to be much worse. Leaving at 7:45 is estimated to cut your exposure by X%." |
| **Retrospective** | Daily/weekly summary | "This week your estimated exposure was 18% lower than your usual pattern; most of it came from the Tuesday evening commute." |

## 6.3 Users and boundaries

- Commuters, students, outdoor workers, people exercising outdoors, parents planning children's travel, people with respiratory sensitivity.
- Decision support, not medical diagnosis or treatment (§40.3).

---

# 7. Core User Experience

The user never needs to understand the GNN, neural operator, PDE, graph or uncertainty model.

## 7.1 Whole-day planning (primary demo flow)

User enters:

```text
Today's schedule:
Home → College (09:30–16:00) → Gym (1 h) → Restaurant → Home (by 22:00)
Mode: metro + walking   ·   Max extra travel: 15 min
```

System responds (numbers illustrative):

> **Your original plan:** estimated PM2.5 inhaled dose **148 µg** (90% interval 121–180).
>
> **Choose a plan:**
>
> | Option | Exposure | Extra time | Chance it beats your plan |
> |---|---|---|---|
> | **A — Lowest exposure** | −34% | +12 min | 96% |
> | **B — Balanced (recommended)** | −28% (90% CI −15% to −37%) | +7 min | 93% |
> | **C — Fastest** | −4% | 0 min | 58% |
>
> **Why option B?**
> - Leaves college 25 minutes later, after the predicted evening peak on Ring Road starts to ease.
> - Takes the inner-street route to the gym, avoiding a high-NO₂ traffic corridor (−11% of the reduction).
> - Gym B instead of Gym A: similar travel time, AC building with filtration.
> - Takes the metro instead of an auto-rickshaw from the restaurant.
>
> **Uncertainty:** moderate around the eastern corridor — monitoring coverage there is sparse. If PM there is 20% higher than predicted, Option A becomes better.
>
> *Estimates, not measurements. Lower exposure does not mean safe.*

## 7.2 Single trip

> "Route B adds 6 minutes but avoids a high-NO₂ traffic corridor and is predicted to reduce your cumulative exposure by 24% (93% chance it is better than Route A)."

## 7.3 Counterfactual questions

"What if I leave 30 minutes later?" · "What if I take the metro instead?" · "What if I use the other gym?" · "What if I stay indoors during the peak?" — each answered with the predicted exposure difference, its interval and the probability that it helps (§26).

## 7.4 Visualization

- An animated pollution field (by pollutant) evolving through the day, with the user's planned trajectory drawn through it and a band showing uncertainty.
- An exposure timeline: concentration encountered and cumulative dose along the day, coloured by microenvironment (home / road / vehicle / college / gym).
- An uncertainty layer that can be toggled to show where the model is unsure and why (sparse sensors, sea-breeze front, active fire).

## 7.5 Communication rules

- Always show **benefit, cost, confidence, and the main reason**.
- When the difference is not confidently positive, say so: *"These options are statistically indistinguishable today; take the faster one."*
- Never say "safe". Use "estimated", "predicted", "about".

---

# 8. System Requirements

## 8.1 Functional requirements

| ID | Requirement | Tier |
|---|---|---|
| FR-1 | Estimate current multi-pollutant fields (PM2.5, PM10, NO₂, O₃, SO₂, CO) with uncertainty for each target city | T0 (PM2.5) / T1 (all) |
| FR-2 | Forecast fields 0–72 h with joint samples; 3–7 day coarse outlook | T0 (0–24 h) / T1 |
| FR-3 | Compute Indian National AQI and sub-indices from predicted concentrations, with uncertainty | T0 |
| FR-4 | Estimate street-level concentrations along candidate routes | T1 |
| FR-5 | Represent a user's day as a time-indexed trajectory through microenvironments | T0 |
| FR-6 | Estimate personal exposure (concentration-time and inhaled dose) per pollutant with uncertainty | T0 |
| FR-7 | Generate and rank alternative routes, departure times, modes and destinations on a Pareto front | T0 (route+time) / T1 (all) |
| FR-8 | Optimize a whole day with time windows and location alternatives | T1 |
| FR-9 | Answer counterfactual "what if" questions | T1 |
| FR-10 | Explain every recommendation: reason, benefit, cost, confidence, main factors | T0 |
| FR-11 | Detect abnormal pollution events and sensor faults | T1 |
| FR-12 | Learn recurring mobility patterns and preferences; issue proactive recommendations | T2 |
| FR-13 | Degrade gracefully when inputs are missing | T0 |

## 8.2 Non-functional requirements (initial targets; to be confirmed)

| ID | Requirement | Target |
|---|---|---|
| NFR-1 | Forecast refresh cadence | Hourly analysis + forecast cycle |
| NFR-2 | Single-trip query latency | ≤ 5 s p95 (server) |
| NFR-3 | Whole-day plan latency | ≤ 30 s p95 |
| NFR-4 | Uncertainty calibration | Nominal 90% intervals cover 85–95% on held-out data, at field and exposure level |
| NFR-5 | Privacy | Raw GPS stays on device by default (§40) |
| NFR-6 | Availability | Every degradation level still returns an answer with honest confidence (§39) |
| NFR-7 | Reproducibility | Every model and dataset is versioned; every experiment is reproducible from config |

## 8.3 Scientific scope decisions

| Decision | Value | Rationale |
|---|---|---|
| Primary pollutant | PM2.5 | Dominant health relevance; best observation coverage |
| Secondary pollutants | NO₂ (traffic tracer, strongest street-scale gradients), O₃ (titration near roads, afternoon peak), PM10 (dust), SO₂, CO | Multi-pollutant exposure and AQI |
| Temporal resolution | 1 h (fields); 1 min (trajectory) | Matches stations and mobility |
| Spatial resolution | Hierarchical, ~27 km → 1 km grid → road segments (10–100 m) (§13) | Compute where the user travels |
| Horizon | 0–72 h; coarse outlook to 7 days | Daily planning + proactive next-day advice |

---

# 9. Complete Feature Set

Features grouped by domain, with tier and status. Full detail in the Feature Matrix (§47).

## 9.1 Environmental intelligence

| Feature | Section | Tier | Status |
|---|---|---|---|
| Multi-pollutant modelling | §14, §18 | T0/T1 | Planned |
| Pollutant-specific concentration prediction | §18 | T0 | Planned |
| Indian National AQI calculation with uncertainty | §18.5 | T0 | Planned |
| Weather integration (wind, BLH, T, RH, rain) | §11, §14 | T0 | Planned |
| Wind-aware transport (dynamic graph edges, advection) | §13, §14, §15 | T1 | Planned |
| Traffic / emission modelling | §11.5, §15 | T1 | Planned |
| Satellite data (TROPOMI, MAIAC, INSAT-3D/3DR, GEMS) | §11, §12 | T1 | Planned |
| Ground sensors (CAAQMS, low-cost) | §11, §12 | T0 | Planned |
| Sparse-sensor reconstruction (assimilation) | §12, §17 | T0/T1 | Planned |
| Missing-data handling | §12.4 | T0 | Planned |
| Anomaly / sensor-fault detection | §30 | T1 | Planned |
| Pollution source / event detection | §30 | T1 | Planned |
| Emission inversion | §16.5 | T2 | Research-only |
| Temporal / spatial / long-horizon forecasting | §18 | T0/T1/T2 | Planned |
| Joint uncertainty, calibration | §19 | T0/T1 | Planned |
| Dynamic field visualization | §7.4 | T0 | Planned |

## 9.2 Human exposure intelligence

| Feature | Section | Tier | Status |
|---|---|---|---|
| GPS trajectory processing, map matching | §20 | T1 | Planned |
| Route history | §20, §27 | T2 | Research-only |
| Transport-mode inference and comparison | §20 | T1 | Planned |
| Activity intensity → ventilation proxy | §22 | T0 | Planned |
| Indoor/outdoor and in-vehicle classification | §21 | T1 | Planned |
| Building context and indoor infiltration dynamics | §21 | T1 | Planned |
| Time per microenvironment | §22 | T0 | Planned |
| Personal cumulative and pollutant-specific exposure | §22 | T0 | Planned |
| Exposure uncertainty | §19, §22 | T0 | Planned |
| Exposure history and trends | §22.6 | T2 | Research-only |

## 9.3 Mobility and decision intelligence

| Feature | Section | Tier | Status |
|---|---|---|---|
| Location → destination routing | §23 | T0 | Planned |
| Alternative route generation | §23.3 | T0 | Planned |
| Exposure-, time-, traffic-, weather-, uncertainty-aware routing | §23 | T0/T1 | Planned |
| Departure-time optimization | §24 | T0 | Planned |
| Travel-mode comparison | §23.6 | T1 | Planned |
| Destination / location alternatives | §25.4 | T1 | Planned |
| Multi-stop and whole-day schedule optimization | §25 | T1 | Planned |
| Counterfactual simulation | §26 | T1 | Planned |
| Risk-aware / robust optimization | §31 | T1/T2 | Planned |
| Multi-objective Pareto recommendations | §31 | T0 | Planned |

## 9.4 Assistant intelligence

| Feature | Section | Tier | Status |
|---|---|---|---|
| Explainability | §29 | T0 | Planned |
| Reactive assistant | §28 | T0 | Planned |
| Proactive assistant | §28 | T2 | Research-only |
| Personalization (patterns, preferences) | §27 | T2 | Research-only |
| Closed-loop adaptation | §27.5 | T2 | Research-only |
| Natural-language interface (optional) | §29.5 | T1 | Experimental |

---

# 10. High-Level Architecture

## 10.1 Layered architecture

```text
╔═══════════════════════════════════════════════════════════════════════════╗
║ L1  MULTI-SOURCE DATA                                                     ║
║  CAAQMS stations │ low-cost sensors │ satellites │ ERA5/IFS weather       ║
║  emission inventories │ traffic │ OSM/buildings │ simulator ensembles     ║
║  mobile-campaign measurements                                             ║
╚═══════════════════════════════════╤═══════════════════════════════════════╝
                                    ↓
          L2  DATA FUSION: QC · alignment · observation operators H_k
                                    ↓
          L3  URBAN REPRESENTATION: hierarchical grid + road graph
              (city → district → neighbourhood → corridor → microenvironment)
                                    ↓
┌───────────────────────────────────────────────────────────────────────────┐
│ L4  DYNAMIC POLLUTION ENGINE                                              │
│   Neural operator (city/regional field, temporal rollout)                 │
│      + Physics layer (advection–diffusion–mixing-height PDE,              │
│        hard constraints, learned chemistry closure, emission inversion)   │
│      + Street-network GNN (corridor-scale downscaling)                    │
│      + Assimilation of new observations                                   │
└───────────────────────────────────┬───────────────────────────────────────┘
                                    ↓
          L5  FORECASTING: 0–72 h fields, AQI, event flags
                                    ↓
          L6  UNCERTAINTY: joint space-time field samples + calibration
                                    ↓
┌───────────────────────────────────────────────────────────────────────────┐
│ L7  HUMAN DIGITAL TWIN                                                    │
│   Trajectory · schedule · mode · activity · microenvironment ·            │
│   building context · personal patterns/preferences (on device)            │
└───────────────────────────────────┬───────────────────────────────────────┘
                                    ↓
          L8  PERSONAL EXPOSURE MODEL: indoor/vehicle dynamics × ventilation
              → p(E(π)) per pollutant
                                    ↓
┌───────────────────────────────────────────────────────────────────────────┐
│ L9  DECISION ENGINE                                                       │
│   Route · departure time · mode · destination · whole-day schedule        │
│   Multi-objective Pareto · risk-aware (CVaR) · robust · chance-constraints│
│   Counterfactual simulation                                               │
└───────────────────────────────────┬───────────────────────────────────────┘
                                    ↓
          L10 ASSISTANT: explanations · confidence · reactive + proactive
                                    ↓
          L11 FEEDBACK / ADAPTATION: observed trajectories, accepted/rejected
              plans, personal-sensor data → personal model; new obs → L4
                                    │
                                    └──────────────→ (back to L4 and L7)

  Cross-cutting: Event detection (L2/L4/L5) · Graceful degradation (all layers)
                 Privacy boundary (L7/L8 on device where possible)
```

## 10.2 Layer contracts

Every layer passes **distributions or samples**, never bare point estimates.

| Layer | Consumes | Produces | Consumed by |
|---|---|---|---|
| L2 Fusion | Raw observations | QC-flagged observations $y_k$, operators $H_k$, error covariances $R_k$, masks | L4 (training, assimilation), L5 (event detection) |
| L3 Representation | OSM, buildings, land use, DEM | Grids, road graph, mapping operators grid↔graph, static features | L4, L9 |
| L4 Pollution engine | Analysis state, coefficient fields ($u, K, h, S, \Lambda$), observations | Posterior mean field + latent state | L5, L6 |
| L5 Forecasting | L4 state, meteorological forecast ensemble | Forecast fields 0–72 h, AQI, event flags | L6, L10 |
| L6 Uncertainty | L4/L5 outputs | $N$ joint samples $\{C^{(s)}(x,t)\}_{s=1}^{N}$ (grid + corridor) | L8, L9 |
| L7 Human twin | GPS, schedule, preferences | Candidate plans $\pi$; trajectory distributions $p(x(t), m(t), a(t), \mu(t) \mid \pi)$ | L8, L9 |
| L8 Exposure | L6 samples, L7 trajectories | Exposure samples $\{E^{(s)}(\pi)\}$ per pollutant | L9 |
| L9 Decision | Exposure samples, travel-time distributions, constraints, user weights | Pareto set, recommended plan, confidence metrics, attributions | L10 |
| L10 Assistant | L9 outputs | User-facing text, visuals, notifications | User, L11 |
| L11 Feedback | User actions, observed trajectories | Updated personal parameters; new observations | L4, L7 |

## 10.3 Why the architecture is justified — component by component

| Component | Real-world complexity it addresses |
|---|---|
| Multi-source fusion | No single source fully describes urban pollution |
| Observation operators | Each instrument measures something different (point, column, biased sensor) |
| Hierarchical representation | Regional transport and street gradients both matter, at different scales |
| Neural operator | Pollution evolution is a field-to-field map governed by a PDE whose coefficients (wind, mixing height, sources, geometry) differ across cities |
| Physics layer | Pollution obeys transport and dilution; data alone is sparse |
| Learned chemistry closure | Secondary aerosol formation is nonlinear and poorly constrained |
| Street-network GNN | Street concentrations are governed by flow through a network of canyons; parallel routes differ at 10–100 m scale |
| Joint uncertainty | Sensors are sparse/noisy; exposure integrates correlated errors |
| GPS trajectory / mobility model | Exposure depends on where and when the person actually moves |
| Microenvironment model | Indoor, in-vehicle and outdoor concentrations differ, with dynamics |
| Activity/ventilation model | Breathing rate varies several-fold with activity |
| Exposure integration | Converts concentration history into personal dose |
| Route / time / mode / destination / schedule optimization | The user controls these, and they interact over a day |
| Risk-aware optimization | Forecasts are uncertain; tails matter |
| Event detection | Abnormal episodes break recurring patterns |
| Personalization & feedback | Users have recurring behaviour and their own trade-offs |
| Explainability | Users act only on recommendations they understand and trust |

## 10.4 Component Card template

Every major component below carries this card (P1):

| Question | Answer |
|---|---|
| **Real-world problem** | What complexity it addresses |
| **Why simpler is insufficient** | And which simpler method is its baseline |
| **Mathematical structure** | Why this architecture fits |
| **Input** | |
| **Output** | |
| **Connects to** | Next layer |
| **Evaluation** | The ablation/metric proving it helps |
| **Status / Tier** | |


---

# 11. Data Sources

The system does not depend on a single AQI source. Each source is used for what it measures well, and enters the model through an observation operator (§12.3). Access status is to be verified (§46.4); all of the hosts below are currently blocked by the development environment's network policy.

## 11.1 Ground air-quality observations

| Source | Variables | Resolution | Role | Notes |
|---|---|---|---|---|
| CPCB CAAQMS (Central Control Room portal) + state boards (DPCC, WBPCB, MPCB, TNPCB) | PM2.5, PM10, NO, NO₂, NOx, SO₂, CO, O₃, NH₃, benzene, met | Point, 15 min–1 h | Primary truth; assimilation; evaluation | Known QC issues: flat-lining, negative values, unit errors, stuck values, reporting delays |
| OpenAQ | Mirrors CPCB and others | Point, 1 h | Convenient historical access | Verify completeness vs CPCB |
| SAFAR (IITM) — Delhi, Mumbai | PM, NO₂, O₃, forecasts, inventory | Point / grid | Additional stations, emission inventory | Access may require agreement |
| Low-cost sensor networks (commercial / research) | PM2.5, PM10 (optical) | Point, 1–5 min | Spatial density | Need RH correction and co-location calibration; access varies |
| **Own mobile monitoring campaign** (§11.8) | PM2.5, NO₂, (BC) | Street-level, 1–10 s | Street-scale truth, validation | Highest value for RQ2/RQ6 |
| **Own portable personal sensors** | PM2.5 | Personal, 1 min | Exposure-model validation | |

## 11.2 Meteorology

| Source | Variables | Role |
|---|---|---|
| ERA5 reanalysis (hourly, ~31 km) | Wind, T, RH, pressure, precipitation, boundary-layer height, friction velocity | Historical coefficient fields; WRF boundary conditions |
| ERA5 ensemble (EDA) | Same, ensemble members | Meteorological uncertainty in training data |
| ECMWF IFS HRES / ENS forecasts | Same, forecasts with ensemble | Real-time forecast drivers; forecast uncertainty |
| IMD surface stations, radiosondes | Point met, vertical profiles | Validation of BLH and winds |
| WRF downscaled meteorology (own runs) | 1–3 km met | Coefficient fields at city scale |

Weather matters because transport depends on wind, and dilution depends on boundary-layer height — the single strongest control on the diurnal cycle of urban PM2.5 in winter.

## 11.3 Satellite observations

| Product | Quantity | Resolution | Coverage notes |
|---|---|---|---|
| Sentinel-5P TROPOMI | Tropospheric NO₂ column (also SO₂, CO, HCHO) | ~5.5 × 3.5 km, daily ~13:30 LT | All four cities; cloud gaps in monsoon |
| MODIS MAIAC | Aerosol optical depth (AOD) | 1 km, ~2×/day | All four cities |
| VIIRS Deep Blue / Dark Target | AOD | ~6 km | Gap filling |
| INSAT-3D/3DR (MOSDAC) | AOD | Half-hourly, geostationary | All four cities; diurnal sampling |
| GEMS (geostationary, Asia) | NO₂, AOD, others | Hourly daytime | Western edge of coverage is near 75°E — **Mumbai (72.8°E) is likely outside; verify** |
| VIIRS / MODIS active fires (FIRMS) | Fire detections, fire radiative power | 375 m / 1 km | Fire source term, event detection |

## 11.4 Emissions and chemistry

| Source | Role |
|---|---|
| EDGAR-HTAP / CAMS-GLOB-ANT | Anthropogenic emissions for the regional (parent) domain |
| UrbanEmissions APnA city inventories (~1 km) | City-scale emission priors for all four cities |
| SAFAR inventories (Delhi, Mumbai) | Higher-quality local priors |
| FINN / GFAS (from VIIRS/MODIS fires) | Open-burning emissions (crop residue, waste) |
| MEGAN | Biogenic emissions |
| Dust module (WRF-Chem) | Thar desert dust, road dust |
| CAMS EAC4 reanalysis / CAMS global forecasts | Chemical boundary conditions; interim coarse operator pretraining data; operational baseline |

## 11.5 Traffic

India has no open traffic-counter data. The traffic emission field is built from:

- **OSM road network and road class** → baseline traffic volume model.
- **Commercial traffic speeds** (TomTom or HERE; cost to be confirmed) → congestion and time-of-day profile.
- **ARAI emission factors** for the Indian fleet (two-wheelers, three-wheeler auto-rickshaws, cars, diesel trucks, CNG and diesel buses).
- Fleet composition per city (registration statistics; Delhi CNG public transport).
- Regulatory events: Delhi Graded Response Action Plan (GRAP) restrictions, odd–even schemes, truck entry bans.

## 11.6 Urban morphology and static data

| Source | Role |
|---|---|
| OpenStreetMap | Roads, POIs (gyms, restaurants, colleges), land use, transit lines and stations |
| Google Open Buildings 2.5D | Building footprints **and heights** across India (canyon geometry, wind model) |
| Microsoft building footprints | Cross-check footprints |
| ESA WorldCover / Sentinel-2 | Land cover, green cover |
| Copernicus DEM | Terrain |
| Land–sea mask, coastline | Sea-breeze geometry (Mumbai, Chennai, Kolkata) |

## 11.7 Historical data

Multi-year station, met and satellite archives provide daily, weekly and seasonal cycles, weather–pollution relationships, festival effects and recurring episodes, and the training/validation splits (§34.6).

## 11.8 Simulation output (generated by us)

| Model | Scale | Provides |
|---|---|---|
| **WRF-Chem** (one India parent domain at 27 km, nested 9 → 3 → ~1 km over each city) | Regional → city | Complete, physically consistent 3-D multi-pollutant fields with known coefficient fields; operator pretraining data |
| **R-LINE** (line-source dispersion) / **SIRANE** (street-network canyon model) | Street, 10–100 m | Street-level concentration fields from traffic; GNN pretraining data |
| **PALM-4U** (building-resolving LES) | A few neighbourhoods, 1–10 m | Ground truth for canyon effects; validates the street model |

## 11.9 Measurement campaign (generated by us)

- **Full mobile campaign in one city** (Delhi or Kolkata — open decision §46.4): calibrated PM2.5/NO₂ (+ black carbon if available) instruments on a vehicle or bicycle, repeated loops over several weeks, covering major roads, inner streets and the routes used in the demo. Follows the Apte et al. (2017) repeated-drive design.
- **Short calibration campaigns** in the other three cities.
- **Co-location** of low-cost sensors with reference stations before and after deployment.
- **Personal exposure trips**: team members carry portable sensors along planned and optimized plans (exposure validation, §37.4).

## 11.10 Human-side data

| Data | Source | Where processed |
|---|---|---|
| GPS trajectory, speed | Phone | On device |
| Schedule | User input / calendar (with consent) | On device |
| Activity (accelerometer, step rate, optional heart rate) | Phone / wearable | On device |
| Preferences (time vs exposure trade-off, modes) | User input + revealed choices | On device |
| Accepted / rejected recommendations | App | On device; aggregated statistics only if opted in |

---

# 12. Data Fusion

## 12.1 Problem

Sources differ in spatial and temporal resolution, measurement error, bias, missing-data patterns and coverage, and **measure different quantities** (a point concentration, a column integral, a humidity-biased optical count). They cannot simply be concatenated or interpolated onto one grid.

## 12.2 Design decision (ADR-005)

Fusion is performed **inside the estimation problem** — training and real-time assimilation — through observation operators, rather than by building a merged gridded product first. Pre-merging would bake one interpolation method's errors into the "truth" and destroy the information about where evidence is weak.

## 12.3 Observation operators

For each source $k$, an operator $H_k$ maps the model state to what the instrument would measure:

$$
y_k = H_k\big(C, \theta_k\big) + \varepsilon_k, \qquad \varepsilon_k \sim \mathcal{N}(b_k, R_k)
$$

| Source | $H_k$ | Error model $R_k$ |
|---|---|---|
| Reference station | Point sample of the surface field (plus representativeness correction for station siting) | Instrument error + representativeness error (larger for kerbside stations) |
| Low-cost sensor | Point sample × humidity response $g(\mathrm{RH};\theta_k)$ + bias $b_k$ | Fitted from co-location |
| Satellite NO₂ column | Vertical integral with averaging kernel, using model vertical profile / BLH | Retrieval error from product |
| Satellite AOD | Column aerosol extinction; learned AOD→surface PM link conditioned on BLH, RH, aerosol type | Retrieval error + link error |
| Mobile platform | Space-time point sample along track (with instrument lag correction) | Instrument + plume/vehicle-exhaust contamination |

## 12.4 Quality control and missing data

- **Range checks**, non-negativity, physical consistency (PM2.5 ≤ PM10, NO₂ ≤ NOx).
- **Flat-line / stuck-value detection**, spike detection, unit-error detection.
- **Spatial consistency**: a spike at one station that neighbours do not see, under the current wind, is flagged as a likely fault (§30.3).
- **Missing data are not imputed before modelling.** Missing values are simply absent from the observation set; the assimilation and the uncertainty model handle them (uncertainty grows where data is absent).
- **Low-cost sensor calibration**: humidity correction and linear/nonlinear calibration against co-located reference instruments; drift monitoring.
- **Temporal alignment**: averaging windows harmonized; timestamps converted to UTC; reporting latency recorded.
- **Spatial alignment**: all sources referenced to the hierarchical grid/graph through $H_k$, not by resampling raw data.

## 12.5 Output

QC-flagged observation tensors $\{y_k\}$, their operators $H_k$, error covariances $R_k$ and masks. Consumed by L4 (training loss and assimilation) and L5/§30 (event detection via innovations).

## 12.6 Component Card — Data fusion

| Question | Answer |
|---|---|
| Real-world problem | Heterogeneous, biased, sparse, partially missing observations of different physical quantities |
| Why simpler is insufficient | Kriging/IDW of stations ignores physics, satellites and bias; pre-merged grids hide where evidence is weak |
| Mathematical structure | Bayesian state estimation with observation operators (data assimilation) |
| Input | Raw observations from §11 |
| Output | $y_k, H_k, R_k$, masks, QC flags |
| Connects to | L4 training loss and real-time assimilation; event detection |
| Evaluation | Leave-station-out error; satellite-holdout error; calibration of innovations ($y - H(\hat C)$ consistent with $R + HPH^\top$) |
| Status / Tier | Planned / T0 (stations) → T1 (satellites, low-cost) |

---

# 13. Urban Representation

## 13.1 Hierarchical multi-resolution representation

One resolution for the whole city is either too coarse for routes or too expensive. We use:

```text
Regional   27 km  (India parent domain: long-range transport, fires, dust)
   ↓
District    9 km
   ↓
City        3 km → ~1 km grid   (neural-operator field)
   ↓
Neighbourhood / corridor  road-segment graph, 10–100 m   (street GNN)
   ↓
Microenvironment  building / vehicle / platform   (indoor & in-vehicle models)
```

**Adaptive refinement:** the street-scale layer is evaluated **only along corridors that candidate plans actually use**, plus a buffer. City-scale fields are computed once per cycle and shared by all users; corridor refinement is computed on demand and cached (§41).

## 13.2 Grid

- Nested grids aligned with the WRF-Chem nests.
- For Geo-FNO, an irregular mesh is deformed onto a latent regular grid, so coastlines (Mumbai's peninsula) and irregular city boundaries are handled.

## 13.3 Road / corridor graph

**Nodes:** road segments (or intersections), monitoring stations, important POIs (college, gyms, restaurants), metro/rail stations, industrial point sources.

**Edges:**

| Edge type | Meaning | Static/Dynamic |
|---|---|---|
| Geographic adjacency | Cell A ↔ Cell B, segment ↔ neighbouring segment | Static |
| Road connectivity | Intersection A ↔ Intersection B (also used for routing) | Static |
| Canyon connectivity | Air exchange between connected street canyons at intersections | Static geometry, dynamic flux |
| Pollution transport | A → B when current wind makes transport from A to B plausible | **Dynamic** (wind-conditioned) |
| Grid ↔ graph | Coupling between the city field and each segment (background concentration above roof level) | Static mapping, dynamic values |

The wind-conditioned edges make the graph more than a static road network: edge weights and directions change with wind speed, direction and stability every hour.

## 13.4 Static features

Road class, lanes, traffic-volume prior, canyon aspect ratio (building height / street width) from Google Open Buildings 2.5D, sky-view factor, green cover, distance to coast, land use, elevation, distance to point sources.

## 13.5 Mapping operators

Restriction $\mathcal{R}$ (fine → coarse) and prolongation $\mathcal{P}$ (coarse → fine) operators couple the grid and graph so that the street layer receives the operator's background field and the operator can receive aggregated street-level information.

---

# 14. Pollution Dynamics

## 14.1 Governing equation

For a pollutant species vector $\mathbf{C} = (C_1, \dots, C_m)$ in a well-mixed urban boundary layer of height $h(x,t)$, integrating the 3-D advection–diffusion–reaction equation over the mixed layer gives the surface-layer approximation used throughout this project:

$$
\frac{\partial C_i}{\partial t}
+ \mathbf{u}\cdot\nabla C_i
- \nabla\cdot(K\nabla C_i)
= \frac{S_i}{h}
+ \frac{1}{h}\Big[\frac{\partial h}{\partial t}\Big]^{+}\big(C_i^{\text{ft}} - C_i\big)
- \Lambda_i C_i
+ \mathcal{X}_i(\mathbf{C}, T, \mathrm{RH}, \dots)
$$

| Term | Meaning | Source of coefficients |
|---|---|---|
| $\mathbf{u}\cdot\nabla C$ | Advection by the boundary-layer-mean wind | ERA5 / WRF, downscaled by a mass-consistent diagnostic wind model with building geometry |
| $\nabla\cdot(K\nabla C)$ | Turbulent horizontal diffusion | Eddy diffusivity from stability, friction velocity |
| $S_i / h$ | Emissions diluted into the mixed layer (a shallow night-time layer concentrates emissions — the key winter mechanism in the IGP) | Inventories + traffic + fires (prior), corrected by inversion (§16.5) |
| $\frac{1}{h}[\partial_t h]^+ (C^{\text{ft}} - C)$ | Entrainment dilution when the boundary layer grows (morning), mixing with cleaner air above | ERA5 / WRF boundary-layer height $h$; $C^{\text{ft}}$ from CAMS / WRF-Chem |
| $\Lambda_i C_i$ | Dry deposition + wet scavenging (rain) | Deposition velocity, precipitation rate |
| $\mathcal{X}_i$ | Chemistry: NO–NO₂–O₃ cycle, secondary aerosol (nitrate, sulphate, organics) | Known part + **learned closure** (§16.4) |

## 14.2 Why this form

- The v1 equation ($\partial_t C + \mathbf{u}\cdot\nabla C = D\nabla^2 C + S - R$) omitted **boundary-layer height**, which controls the strongest signal in Indian urban PM (night-time accumulation, morning dilution). The term $S/h$ and the entrainment term restore it.
- When $h$ collapses in the evening, existing pollution is left in a residual layer (no dilution term applies when $\partial_t h<0$), while fresh emissions are concentrated into the shallow layer — the classic evening build-up.
- It is a **2-D surface model** suitable for a fast emulator. The 3-D truth comes from WRF-Chem. The limits of the 2-D reduction are tested by comparing against WRF-Chem surface fields (§37.3).

## 14.3 Regime dependence

| City | Dominant terms |
|---|---|
| Delhi | $S/h$ under shallow $h$; fire source from upwind; regional advection; dust in pre-monsoon |
| Kolkata | Inflow from upwind (IGP) boundaries; local combustion sources |
| Mumbai | Advection under sea-breeze reversal; sea-salt source; recirculation |
| Chennai | Sea breeze; wet scavenging in the Oct–Dec monsoon |

The same equation with different coefficient fields → the same **operator** must work across all four (§17).

## 14.4 Multi-pollutant coupling

- **NO–NO₂–O₃:** near roads, fresh NO titrates O₃ (lower O₃ on busy roads, higher NO₂) — routing trade-offs differ by pollutant.
- **Secondary PM:** nitrate and secondary organics are a large part of winter IGP PM2.5; formed from precursors (NOx, NH₃, VOCs) over hours, so they are regional rather than street-scale.
- **Primary PM / dust / sea salt:** directly emitted.

---

# 15. GNN Architecture and Street-Scale Layer

## 15.1 Problem

Route choice happens between parallel streets 50–500 m apart. Kilometre-scale fields give nearly identical exposure to every candidate route, so without a street-scale layer a "cleaner route" would just be noise. Concentrations in a street depend on traffic in that street, canyon geometry, and air exchange with neighbouring streets and the roof-level background.

## 15.2 Baseline: land-use regression (LUR) downscaling

$$
C_{\text{street}}(x,t) = C_{\text{city}}(x,t) + \sum_j \beta_j(t)\, f_j(x) + \epsilon
$$

with $f_j$ = distance to major roads, road class, traffic volume, canyon aspect ratio, green cover. Interpretable, cheap, and the baseline that the GNN must beat (ablation A6).

## 15.3 Street-network GNN

**Why a GNN:** street-network dispersion models (SIRANE, MUNICH) already treat a city as a **graph of street canyons** exchanging pollutant mass at intersections and with the roof-level background. A GNN is the learnable, assimilating analogue of that physical model; a CNN on a grid does not match the 1-D network geometry of streets.

**Structure (physics-structured message passing):**

$$
\frac{d C_v}{dt} = \underbrace{\frac{q_v^{\text{traffic}}}{V_v}}_{\text{emission}}
+ \underbrace{\sum_{w\to v} \phi_\theta\big(\max(\mathbf{u}\cdot\mathbf{e}_{wv}, 0), \text{geom}\big)\,(C_w - C_v)}_{\text{wind-directed exchange (upwind flux form)}}
+ \underbrace{\kappa_\theta(\text{aspect}, u_{\text{roof}})\,\big(C^{\text{bg}}_v - C_v\big)}_{\text{exchange with roof-level background}}
+ r_\theta(\cdot)
$$

- Flux form keeps **mass consistency** (what leaves one segment enters another).
- $C^{\text{bg}}$ comes from the neural-operator field (via $\mathcal{P}$).
- $\phi_\theta, \kappa_\theta$ are small learned networks initialised to match the physical model; $r_\theta$ is a small residual.
- Non-negativity is enforced by construction.

**Training:** (1) pretrain to emulate R-LINE/SIRANE output across many traffic/met scenarios; (2) validate against PALM-4U in the LES neighbourhoods; (3) fine-tune on mobile-campaign and station data.

**A second, station-level spatiotemporal GNN** (stations as nodes, wind-conditioned edges, temporal encoder) is kept as **Baseline 4/5** (§35) — the standard approach in the literature that our operator must beat.

## 15.4 Component Card — Street-network GNN

| Question | Answer |
|---|---|
| Real-world problem | Street-scale gradients (10–100 m) decide which route is cleaner |
| Why simpler is insufficient | LUR ignores time-varying wind direction and inter-street exchange; km-scale fields cannot distinguish parallel streets |
| Mathematical structure | Graph of canyons with mass-exchange fluxes ⇒ message passing in flux form |
| Input | Operator background field, traffic emissions per segment, wind, canyon geometry |
| Output | Street-level concentration (and residual uncertainty) per segment and hour |
| Connects to | L6 corridor samples → L8 exposure → L9 routing |
| Evaluation | Mobile-campaign error vs LUR and vs no downscaling (A6); fraction of route decisions that change and whether measurements confirm them |
| Status / Tier | Planned / T1 (LUR in T0) |

---

# 16. Physics-Informed Layer

Physics enters through **four distinct mechanisms**, each with its own ablation.

## 16.1 Physics-informed data (simulator pretraining)

The operator first learns from WRF-Chem ensembles — fields that satisfy the physics by construction (§17.4).

## 16.2 Hard constraints (built into the architecture)

- Non-negativity (output in log-space or through a softplus).
- Flux-form, mass-consistent exchange in the street GNN.
- Boundary conditions: inflow from the parent domain at city boundaries.
- Physical consistency between species (PM2.5 ≤ PM10).

## 16.3 Soft constraint: PDE residual loss (physics-informed neural operator)

On collocation points (any space-time points, **no labels needed**):

$$
\mathcal{L}_{\text{phys}} = \frac{1}{|\Omega_c|}\sum_{(x,t)\in\Omega_c}\Big\| \mathcal{R}\big(\hat{\mathbf C}\big)(x,t)\Big\|^2,
$$

with $\mathcal{R}$ = left side minus right side of the §14.1 equation. The residual needs the coefficient fields $\mathbf u, K, h, S, \Lambda$, all of which are available (§14.1). Practical issues and mitigations:

- **Loss balancing:** residual and data terms have different scales → adaptive weighting (e.g., gradient-norm balancing) and curriculum (data first, physics weight ramped).
- **Fast chemistry stiffness:** chemistry is handled by the closure term, not forced through the residual.
- **Resolution:** the residual can be evaluated at higher resolution than the data (a PINO advantage).

## 16.4 Hybrid closure for chemistry and unresolved processes

$$
\mathcal{X}_i = \mathcal{X}_i^{\text{known}}(\mathbf C) + \mathcal{X}_{\theta,i}(\mathbf C, T, \mathrm{RH}, \text{radiation}, \mathrm{NH}_3, \dots)
$$

- $\mathcal{X}^{\text{known}}$: simple known chemistry (e.g., NO–NO₂–O₃ photostationary relation).
- $\mathcal{X}_\theta$: a small learned network for secondary aerosol formation and processes the 2-D model cannot resolve.
- **Why:** secondary aerosol chemistry is strongly nonlinear and poorly constrained; pretending the PDE covers it would let the physics loss penalize correct predictions. Physics constrains transport and dilution; the network learns what physics cannot resolve, and $\mathcal{X}_\theta$ can be inspected (e.g., does it learn nitrate formation at high RH and low T?).

## 16.5 Emission inversion

Emissions are the largest error source in Indian inventories. The source field is treated as an unknown with a prior:

$$
\mathcal{L}_{\text{src}} = \|\hat S - S_{\text{prior}}\|^2_{B^{-1}}
$$

and optimized jointly with the operator during fine-tuning (and, in T2, in the real-time assimilation). Outputs: corrected emission maps per sector and season — a research result in itself — and better forecasts.

## 16.6 Total training objective

$$
\mathcal{L} = \lambda_d \underbrace{\sum_k \big\|H_k(\hat{\mathbf C}) - y_k\big\|^2_{R_k^{-1}}}_{\text{data (all sources)}}
+ \lambda_p \mathcal{L}_{\text{phys}}
+ \lambda_s \mathcal{L}_{\text{src}}
+ \lambda_{\text{sim}} \underbrace{\|\hat{\mathbf C} - \mathbf C^{\text{sim}}\|^2}_{\text{pretraining only}}
+ \lambda_r \mathcal{L}_{\text{reg}}
$$

This generalizes v1's $\lambda_d\mathcal L_{data} + \lambda_p\mathcal L_{physics} + \lambda_r\mathcal L_{regularization}$.

## 16.7 Component Card — Physics layer

| Question | Answer |
|---|---|
| Real-world problem | Observations are sparse; purely data-driven models learn correlations that break in new conditions/cities |
| Why simpler is insufficient | Unconstrained networks can produce mass-violating or negative fields and extrapolate poorly |
| Mathematical structure | Advection–diffusion–mixing-height PDE with known coefficients and a learned closure |
| Input | Predicted fields, coefficient fields, emission prior |
| Output | Loss terms, constrained fields, corrected emissions |
| Connects to | Trains L4; corrected emissions feed forecasting and event attribution |
| Evaluation | Ablations A2/A4/A5: with vs without each mechanism, especially on the held-out city; physics-residual magnitude on test data |
| Status / Tier | Planned / T1 (hard + residual), T2 (inversion) |

---

# 17. Neural Operator Layer

## 17.1 Problem

The system must produce **whole future fields** quickly (hourly, for four cities, with ensembles), assimilate new observations, run at different resolutions, and work in a city with little data. WRF-Chem is too slow for real-time ensembles; station-based models do not produce fields.

## 17.2 Why an operator

A neural operator learns a map between **function spaces**:

$$
\mathcal{G}_\theta : \big(\mathbf C(\cdot, t),\; a(\cdot, t{:}t{+}\Delta t)\big) \;\mapsto\; \mathbf C(\cdot, t+\Delta t),
\qquad a = (\mathbf u, K, h, S, \Lambda, \text{land–sea mask}, \text{morphology})
$$

- The task is literally field → field evolution of a PDE whose **coefficient fields** differ across cities: exactly the setting operator learning targets.
- **Discretization invariance:** train on 9/3 km simulation, evaluate on ~1 km grids.
- **Cross-city transfer:** a new city is a new coefficient field, not a new problem.

## 17.3 Architecture choice

| Option | Use |
|---|---|
| **Geo-FNO** (FNO with learned deformation to a latent grid) | **Primary** — handles coastlines and irregular domains with FFT efficiency |
| GNO / graph neural operator | Alternative for fully irregular meshes; candidate for coupling with the road graph |
| FNO on regular nested grids | Simplest variant; ablation baseline |
| DeepONet | Comparison only |

**Temporal structure:** autoregressive rollout with $\Delta t = 1$ h, trained with multi-step unrolled loss (and noise injection) for long-horizon stability. Meteorological forcing comes from the ensemble forecast at each step.

**Assimilation step:** each cycle, the current state is updated with new observations (a learned analysis step minimizing the §16.6 data term with a background term), then rolled forward.

## 17.4 Ground truth for the operator

You never have a fully observed real concentration field; neither does any weather or air-quality model. Ground truth is built in layers:

| Layer | Source | What it supervises |
|---|---|---|
| A. Simulation | WRF-Chem ensemble (perturbed ERA5 meteorology + log-normal sector-wise emission scaling + boundary conditions), R-LINE/SIRANE, PALM-4U | Dense full-field loss; learns the solution operator |
| A′. Interim | CAMS reanalysis / forecasts (coarse but physically consistent, model + assimilation) | Pretraining before WRF-Chem runs exist |
| B. Observations | Stations, satellites, low-cost sensors via $H_k$ | Corrects simulator bias (especially emissions) |
| C. Own campaign | Mobile monitoring, personal sensors | Street-level truth; independent validation |
| Physics residual | No labels | Constrains everywhere between observations |

**Simulation ensemble periods:** Delhi — Oct–Nov crop burning, Dec–Jan winter, Apr–May dust; Chennai — north-east monsoon, Bhogi; Mumbai — winter sea-breeze season; Kolkata — winter IGP outflow; all four — a monsoon period (clean contrast, exercises wet scavenging).

**WRF-Chem configuration:** MOZART gas-phase chemistry with MOSAIC aerosol and a volatility-basis-set scheme for secondary organic aerosol (nitrate and secondary organics matter in winter IGP). Delhi and Kolkata nests must include the upwind IGP; Mumbai and Chennai nests must include enough sea to resolve the sea breeze.

## 17.5 Known limitation

Zero-shot super-resolution cannot invent sub-grid physics absent from training data. Sub-kilometre structure comes from the street GNN (trained on street models, PALM and measurements), not from the operator — which is why both components are needed.

## 17.6 Component Card — Neural operator

| Question | Answer |
|---|---|
| Real-world problem | Fast, assimilating, ensemble-capable evolution of whole pollution fields across cities |
| Why simpler is insufficient | WRF-Chem too slow for real-time ensembles; station models don't produce fields; CNNs tied to one grid/city |
| Mathematical structure | Solution operator of a parametric PDE; function-space learning; discretization invariance |
| Input | Current (analysis) field + coefficient fields + forecast meteorology |
| Output | Future field (mean / latent state) at hourly steps |
| Connects to | L5 forecasting, L6 uncertainty (conditioning), street GNN (background) |
| Evaluation | Leave-one-city-out error vs GNN baselines (A1–A4); rollout stability to 72 h; resolution transfer; agreement with WRF-Chem on held-out simulations |
| Status / Tier | **Committed core component (ADR-003)** / T1 (interim CAMS-pretrained + single-city WRF-Chem), T2 (four-city ensembles) |

---

# 18. Forecasting

## 18.1 Horizons

| Horizon | Use | Main drivers | Expected skill |
|---|---|---|---|
| Nowcast 0–3 h | Current trip | Assimilated state, persistence, traffic | High |
| Short range 3–24 h | Today's plan | Operator rollout + IFS meteorology | Moderate–high |
| Day ahead 24–72 h | Tomorrow's plan, proactive advice | Meteorology ensemble dominates | Moderate |
| Long horizon 3–7 days | Outlook only ("Thursday likely poor") | Ensemble meteorology + regime/climatology blend | Low; shown as categories |

## 18.2 Forecast cycle (hourly)

```text
New observations → QC (§12) → assimilation (analysis field)
→ operator rollout × meteorological ensemble members
→ generative uncertainty sampler (§19) → N joint samples, 0–72 h
→ corridor refinement on demand (street GNN)
→ AQI, event flags, publish
```

## 18.3 Temporal and spatial forecasting

- **Temporal:** autoregressive operator; diurnal/weekly cycles enter through emissions (traffic profiles) and meteorology (BLH), not hand-coded features.
- **Spatial:** full field at each step; street-level on demand.
- **Long-horizon degradation:** predictive spread is allowed to grow; beyond 72 h the forecast blends toward a regime-conditional climatology and is shown only in categories.

## 18.4 Pollutant-specific prediction

PM2.5 (primary), PM10, NO₂, O₃, SO₂, CO, with species coupling (§14.4). T0 = PM2.5 only.

## 18.5 AQI (India National AQI)

AQI is a **communication layer**, not the optimization target (ADR-015): optimization uses concentrations and dose.

- Sub-index for each pollutant by piecewise-linear interpolation between CPCB breakpoints; AQI = maximum sub-index; requires at least three pollutants including PM2.5 or PM10.
- Averaging: 24 h for PM2.5, PM10, NO₂, SO₂, NH₃, Pb; 8 h for CO and O₃ (O₃ 1 h also defined).
- Categories: Good (0–50), Satisfactory (51–100), Moderately polluted (101–200), Poor (201–300), Very poor (301–400), Severe (401–500).

Indicative PM breakpoints (µg/m³, 24 h) — **verify against the CPCB NAQI document before implementation**:

| Category | PM2.5 | PM10 |
|---|---|---|
| Good | 0–30 | 0–50 |
| Satisfactory | 31–60 | 51–100 |
| Moderately polluted | 61–90 | 101–250 |
| Poor | 91–120 | 251–350 |
| Very poor | 121–250 | 351–430 |
| Severe | >250 | >430 |

**AQI uncertainty:** computed by evaluating the AQI on each joint sample, giving the probability of each category ("70% chance tomorrow is Very poor").

## 18.6 Visualization of the dynamic field

Animated per-pollutant field with uncertainty overlay, station/sensor markers, wind arrows, fire detections; the user's trajectory overlaid (§7.4).

---

# 19. Uncertainty Quantification

## 19.1 Problem

Sensors are sparse and noisy, emissions are uncertain, weather forecasts are uncertain, and the model is imperfect. A system that outputs "PM2.5 = 137.2 µg/m³" with no evidence in a sparse area is misleading. Instead:

> Predicted PM2.5: 137 µg/m³ (90% interval 98–181) · Confidence: low (sparse monitoring)

## 19.2 Key requirement: joint samples, not marginal intervals

**Exposure is a path integral.** Errors along a route are strongly correlated in space and time (a mis-placed plume or a wrong boundary-layer height affects the whole route). Per-cell intervals (marginals), treated as independent, give exposure intervals that are far too narrow. The uncertainty layer must therefore produce **joint space-time samples** of whole fields:

$$
\{\mathbf C^{(s)}(x,t)\}_{s=1}^{N} \sim p\big(\mathbf C(\cdot, t{:}t{+}H)\mid \mathcal Y_{\le t}\big)
$$

## 19.3 Sources and how each is modelled

| Source | Type | Model |
|---|---|---|
| Meteorology | Aleatoric/forcing | Drive the operator with ECMWF ENS members |
| Emissions | Epistemic | Posterior from inversion (§16.5); sector-wise scaling samples |
| Model structure | Epistemic | Deep ensemble of operators (different seeds/data orders) |
| Unresolved variability | Aleatoric | **Conditional generative sampler** — score-based diffusion or flow matching conditioned on operator mean, meteorology and static features, producing spatially coherent residual fields. Alternative/baseline: SPDE (Matérn) Gaussian-process residual model |
| Observations | Aleatoric | $R_k$ per instrument (§12.3) |
| Street-scale | Both | GNN ensemble + residual variance from mobile-campaign fit |
| Mobility | Aleatoric | Travel-time distributions per edge and time (§20) |
| Microenvironment | Epistemic | Priors on infiltration factors and in-vehicle ratios (§21) |
| Ventilation | Aleatoric | Activity-dependent breathing-rate distributions (§22) |

**Why a generative model (ADR-009):** the residual field is high-dimensional, non-Gaussian (plumes, fronts, skewed concentrations) and spatially correlated. A Gaussian process captures correlation but not plume structure; marginal methods capture neither. Diffusion/flow models are the established way to sample realistic high-dimensional fields conditioned on a forecast. The SPDE-GP is kept as a simpler baseline (ablation A7).

## 19.4 Uncertainty propagation

```text
Sensor uncertainty (R_k)
       ↓
Reconstruction uncertainty (analysis posterior)
       ↓
Future-field uncertainty (met ensemble × model ensemble × generative residual)
       ↓
Street-scale uncertainty (GNN ensemble)
       ↓
Indoor/outdoor & in-vehicle uncertainty (parameter priors, classification probability)
       ↓
Trajectory uncertainty (travel times, mode, route deviation)
       ↓
Activity / ventilation uncertainty
       ↓
Exposure distribution p(E(π))
       ↓
Optimization uncertainty (Pareto set under samples)
       ↓
Recommendation confidence (paired P(improvement), CI, robustness, VOI)
```

Implemented by nested Monte Carlo: for each joint field sample $s$, draw mobility, microenvironment and ventilation samples, integrate exposure along the plan. **All candidate plans are evaluated on the same samples** (common random numbers) so that comparisons are paired (§31.5).

## 19.5 Variance decomposition

A Sobol sensitivity analysis attributes exposure variance to each source (met, emissions, model, street, indoor, mobility, ventilation). Uses: a key research figure; tells us where more data would help most; feeds value-of-information messages (§31.6).

## 19.6 Calibration — checked at every level

| Level | Metrics |
|---|---|
| Field marginals | CRPS, PIT histograms, interval coverage, NLL |
| Joint structure | **Energy score**, **variogram score** (tests whether spatial/temporal correlation is right — the property exposure depends on), rank histograms |
| Exposure | Coverage of exposure intervals vs mobile-campaign and personal-sensor trips |
| Decisions | Reliability of $P(\text{improvement})$: among plans rated 80% likely better, about 80% should be better when checked against measurements/held-out reanalysis |

**Conformal prediction as the outer layer (ADR-010):** adaptive conformal inference applied to the final scalar exposure estimate provides a finite-sample coverage guarantee robust to drift. It sits **on top of** the generative model; it does not replace it (conformal alone yields marginal intervals only).

## 19.7 Sparse-region detection and "knowing when not to recommend"

- Predictive spread and an observation-coverage index (distance to and number of informative observations, wind-weighted) are mapped every cycle.
- When the paired probability of improvement is low or the reduction interval contains zero, the assistant says the options are indistinguishable (§31.7).

## 19.8 Component Card — Uncertainty

| Question | Answer |
|---|---|
| Real-world problem | Sparse, noisy, biased data; uncertain weather and emissions; decisions depend on correlated errors |
| Why simpler is insufficient | Point forecasts give false precision; marginal intervals mis-state exposure uncertainty |
| Mathematical structure | Bayesian predictive distribution over fields; generative sampling; Monte Carlo propagation |
| Input | Operator/GNN outputs, met ensemble, emission posterior, residual statistics |
| Output | $N$ joint field samples (grid + corridors) |
| Connects to | L8 exposure, L9 decisions, L10 confidence text |
| Evaluation | Calibration table above; ablation A7 (joint vs marginal vs none) |
| Status / Tier | Planned / T0 (ensemble + met ensemble), T1 (generative sampler + conformal), T2 (full emission posterior) |


---

# 20. Human Mobility Model

## 20.1 Problem

The user is not a static point. The system models $x(t)$ — and transport mode $m(t)$, activity $a(t)$ and microenvironment $\mu(t)$ — over time, for both **observed** (past) and **planned** (future) days.

## 20.2 Inputs

GPS trajectory, current location, destination, route, speed, transit stops, schedule, activity sensors, time, route history.

## 20.3 Transport modes (India-specific)

| Mode | Air contact | Notes |
|---|---|---|
| Walking | Open | Kerbside exposure, elevated breathing |
| Cycling | Open | High breathing rate, near traffic |
| Two-wheeler | Open | Most common mode; in exhaust plumes |
| Auto-rickshaw (three-wheeler) | Open | In traffic stream; likely among the highest-exposure modes |
| Cycle-rickshaw | Open | |
| Car — non-AC, windows open | Open | |
| Car / taxi / ride-hail — AC, recirculation | Enclosed | Can reduce PM substantially; depends on filter, recirculation setting |
| Bus — non-AC | Open windows | |
| Bus — AC | Enclosed | |
| Metro (elevated / underground) | Enclosed | **Underground platforms can have high PM of their own** |
| Suburban rail (Mumbai locals, Kolkata, Chennai MRTS) | Open doors | |

In-vehicle factors come from Indian commuter-exposure studies where available, not from non-Indian defaults (§21.4).

## 20.4 Components

- **Map matching** of GPS to the road graph (HMM-based).
- **Stay-point detection** (where the user stopped) and place labelling (home, college, gym) — on device.
- **Mode inference** (speed, acceleration, stop pattern, transit-line proximity) as a **probability over modes**, not a hard label.
- **Travel-time distributions** per edge, mode and time of day (from traffic data and observed trips).
- **Planned trajectory generation:** for a candidate plan $\pi$, a distribution over $x(t)$ given travel-time uncertainty and possible route deviations.

## 20.5 Component Card — Mobility

| Question | Answer |
|---|---|
| Real-world problem | Exposure depends on where/when/how the person actually moves |
| Why simpler is insufficient | A fixed point or a home-location assumption ignores most exposure variation |
| Mathematical structure | Time-indexed stochastic trajectory; HMM map matching; probabilistic classification |
| Input | GPS, schedule, transit network, traffic |
| Output | $p(x(t), m(t), a(t)\mid\pi)$ |
| Connects to | L8 exposure, L9 optimization, §27 personalization |
| Evaluation | Map-matching accuracy; mode-inference accuracy (labelled trips); travel-time calibration |
| Status / Tier | Planned / T0 (planned trajectories), T1 (GPS processing, mode inference) |

---

# 21. Indoor / Outdoor and In-Vehicle Microenvironment Model

## 21.1 Why it matters

People spend most of their time indoors or in vehicles. The trajectory is a sequence of **microenvironments**, each with its own exposure model:

```text
HOME (indoor) → ROAD (outdoor/vehicle) → COLLEGE (indoor) → ROAD → GYM (indoor, high activity)
→ RESTAURANT (indoor, cooking source) → ROAD → HOME
```

```text
Outdoor concentration (street-level, from L6)
        ↓
Indoor infiltration / building or vehicle model (dynamic)
        ↓
Indoor / in-vehicle concentration  (+ indoor sources)
        ↓
Personal exposure (× ventilation)
```

The model must not blindly apply the outdoor concentration to a user who is inside a building.

## 21.2 Microenvironment classification

Infers indoors / outdoors / in-transit (by mode) / building type, with probabilities, from GPS, geofencing, POIs, building footprints, schedule, motion/mode, GPS signal quality and optional device signals (Wi-Fi, barometer). Misclassification probability propagates into exposure uncertainty.

## 21.3 Dynamic mass-balance model

$$
\frac{dC_{\text{in}}}{dt} = P\,a\,C_{\text{out}}(t) - (a + k)\,C_{\text{in}} + \frac{S_{\text{in}}(t)}{V}
$$

- $a$ air-exchange rate, $P$ penetration factor, $k$ indoor loss (deposition, filtration), $S_{\text{in}}$ indoor source, $V$ volume.
- Steady-state infiltration factor $F_{\text{inf}} = \dfrac{P a}{a+k}$.
- **Dynamics matter:** indoor concentration lags outdoor by roughly $1/(a+k)$. "Stay indoors during the peak" depends on this lag; the steady-state ratio overstates the benefit for short peaks in leaky buildings and understates it in tight ones.

## 21.4 Parameters (as priors, to be fitted)

| Microenvironment | Indicative $F_{\text{inf}}$ prior | Indoor sources |
|---|---|---|
| Naturally ventilated Indian home/college (windows open) | High (≈0.6–1.0) | Cooking (solid fuel in some homes), incense, mosquito coils |
| Sealed AC building | Lower (≈0.2–0.6) | |
| AC building with filtration / purifier | Low | |
| Restaurant | Variable | Cooking (strong) |
| Gym | Building-dependent | High activity → high ventilation |
| AC car, recirculation | Low–moderate | |
| Open modes | 1 (outdoor + in-traffic increment) | Exhaust plumes |
| Underground metro platform | Not tied to outdoor | Own source (brake/rail wear); separate prior |

Indicative ranges are placeholders to be replaced by fitted values from Indian measurement literature and our own personal-sensor trips.

## 21.5 Honest consequence

In many Indian buildings $F_{\text{inf}}$ is close to 1, so "stay indoors" saves much less than in sealed Western buildings; indoor sources can even make indoors worse. The system reports this rather than assuming indoor = clean.

## 21.6 Component Card — Microenvironment

| Question | Answer |
|---|---|
| Real-world problem | Indoor/in-vehicle concentrations differ from outdoor, with lags and own sources |
| Why simpler is insufficient | Outdoor-only exposure overestimates some and underestimates other contributions; it mis-ranks plans that involve indoor time or mode change |
| Mathematical structure | Linear ODE mass balance with uncertain parameters |
| Input | Outdoor samples at the location, building/vehicle type, classification probabilities |
| Output | Indoor/in-vehicle concentration samples |
| Connects to | L8 exposure |
| Evaluation | Ablation A8 (outdoor-only vs indoor+outdoor) against personal-sensor trips; fraction of decisions changed |
| Status / Tier | Planned / T1 (T0: fixed infiltration factors by type) |

---

# 22. Personal Exposure Model

## 22.1 Two exposure quantities

**Concentration-time exposure** (what the person was surrounded by):

$$
X_i(\pi) = \int_{t_0}^{t_1} C_i^{\mu(t)}\big(x(t), t\big)\,dt \qquad [\mu\text{g}\cdot\text{h}/\text{m}^3]
$$

**Inhaled dose** (what entered the lungs, using ventilation rate $\dot V$):

$$
E_i(\pi) = \int_{t_0}^{t_1} C_i^{\mu(t)}\big(x(t), t\big)\,\dot V\big(a(t)\big)\,dt \qquad [\mu\text{g}]
$$

where $C_i^{\mu(t)}$ is the concentration in the microenvironment occupied at time $t$ (outdoor, in-vehicle or indoor from §21). Roughly: **exposure = concentration × inhaled air × duration**. The decision engine uses $E$ (dose) by default because activity choice (running vs walking) changes it; $X$ is also reported.

## 22.2 Ventilation by activity

Indicative adult ranges (to be parameterized from the US EPA Exposure Factors Handbook, ch. 6, and adjusted for age, sex and body mass; personalizable):

| Activity | Ventilation (L/min, indicative) |
|---|---|
| Sleep | ~5 |
| Sitting / sedentary | ~6–8 |
| Light (slow walk, commuting seated) | ~11–13 |
| Moderate (brisk walk, cycling easy) | ~25–30 |
| High (running, gym) | ~45–55 |

This is why a 45-minute run during a peak can produce several times the dose of a short walk, and why **exercise timing and location** are high-value recommendations.

## 22.3 Exposure units (defines v1's "14.8 units")

- Primary unit: **PM2.5 inhaled dose in µg** for the period (per pollutant for others).
- Secondary: concentration-time exposure in µg·h/m³.
- Optional display index: dose relative to the dose the user would receive breathing at rest for 24 h at the national 24-h standard — dimensionless, clearly labelled as relative, **not a health score**.
- No multi-pollutant "health index" is combined into one number without an evidence base; multi-pollutant results are shown per pollutant.

## 22.4 Exposure field

For a fixed pollution field, different users experience different exposure because they move differently, travel at different times, spend different time outdoors, do different activities, use different modes and spend time in different buildings. The system therefore produces **a personal exposure field**: for each candidate plan, the distribution of $E$, and along the plan, the contribution of each segment.

## 22.5 Pollutant-specific exposure

NO₂ is dominated by near-road segments (route choice matters most); PM2.5 by regional background and time of day (timing matters most); O₃ is higher away from traffic in the afternoon (a real trade-off against NO₂). Recommendations state which pollutant drives them.

## 22.6 Exposure history and trends (T2)

Daily, weekly and monthly exposure from observed trajectories; comparison with the user's typical pattern; attribution to recurring trips ("your Tuesday evening commute is 30% of your weekly dose").

## 22.7 Component Card — Exposure

| Question | Answer |
|---|---|
| Real-world problem | Converts a concentration history along a moving, breathing person into a dose |
| Why simpler is insufficient | Ambient AQI at home or destination ignores time, route, mode, microenvironment, breathing |
| Mathematical structure | Path integral over a stochastic trajectory and field; Monte Carlo |
| Input | Field samples, trajectory samples, microenvironment model, ventilation |
| Output | Samples of $E_i(\pi)$, $X_i(\pi)$, per-segment contributions |
| Connects to | L9 decision, L10 explanation |
| Evaluation | Against personal-sensor trips (concentration-time); bias, correlation, interval coverage |
| Status / Tier | Planned / T0 |

---

# 23. Route Optimization

## 23.1 Problem

Not "find the route with the lowest current AQI", but:

> Find feasible routes through a **dynamically evolving, uncertain** pollution field that trade off predicted cumulative exposure against travel time, distance and risk, subject to the user's constraints.

## 23.2 Time-dependent stochastic graph

- Edges have time-dependent travel-time distributions $\tau_e(t)$ (traffic-aware) and exposure contributions that depend on the arrival time at the edge (field evolves while the user travels) and the mode.
- **Weather-aware:** rain changes both travel times and the field (washout); heat/rain change mode feasibility (walking, two-wheeler).

## 23.3 Algorithm (two-stage)

1. **Candidate generation** on the mean field: multi-criteria time-dependent label-setting (Pareto labels over expected exposure and time; e.g., NAMOA*-style search), plus diverse k-shortest paths (penalty / plateau methods) to ensure genuinely different alternatives.
2. **Stochastic evaluation:** evaluate each candidate on the $N$ shared joint samples → full distributions, paired comparisons, risk measures (§31).

This keeps search fast (deterministic labels) while decisions use the full uncertainty.

## 23.4 Exposure-, time-, traffic-, weather-, uncertainty-aware

All are properties of the edge cost distributions and the evaluation stage, not separate algorithms.

## 23.5 Example output

```text
Route A   Travel 38 min   Dose 14.8 µg (12.1–18.0)                       Baseline
Route B   Travel 44 min   Dose 10.6 µg ( 8.7–13.2)   P(better than A) = 0.93
```

> Route B is estimated to reduce exposure by ~28% (90% CI 15–37%) for 6 more minutes, mainly by avoiding the Ring Road corridor between 18:00 and 18:30.

## 23.6 Mode comparison

The same machinery evaluates the same origin–destination over modes (walk+metro vs auto vs two-wheeler vs AC cab), each with its microenvironment model and travel-time distribution.

## 23.7 Component Card — Routing

| Question | Answer |
|---|---|
| Real-world problem | The user can choose among feasible paths and modes |
| Why simpler is insufficient | Lowest-current-AQI routing ignores field evolution during the trip, street gradients, mode and uncertainty |
| Mathematical structure | Time-dependent multi-criteria shortest path + stochastic evaluation |
| Input | Road/transit graph, travel-time distributions, field samples, microenvironment models |
| Output | Pareto set of routes with exposure distributions |
| Connects to | §25 schedule optimizer, §31 risk/multi-objective selection, L10 |
| Evaluation | Exposure reduction, extra time/distance, constraint violations, robustness under uncertainty; vs shortest-time and lowest-AQI baselines |
| Status / Tier | Planned / T0 |

---

# 24. Time Optimization

## 24.1 Problem

Route choice is only one control. **When** to travel is often the larger lever (rush hour, boundary-layer dynamics).

```text
Leave 17:00 → high       Leave 17:30 → high
Leave 18:15 → moderate   Leave 19:00 → low
```

> "Leaving at 18:15 instead of 17:30 is estimated to reduce exposure by 23% while keeping your arrival within your acceptable window."

## 24.2 Method

Departure times discretized (e.g., 5–10 min steps) within the user's window; for each, run time-dependent routing; evaluate on shared samples; enforce arrival constraints as chance constraints ($P(\text{late}) \le \varepsilon$). Time and route are optimized **jointly**, not sequentially.

## 24.3 Component Card — Time optimization

| Question | Answer |
|---|---|
| Real-world problem | Exposure varies strongly with time of day |
| Why simpler is insufficient | Route-only optimization misses the largest lever in IGP winter (H4) |
| Mathematical structure | Search over departure time × time-dependent routing; chance constraints |
| Input | Window, arrival constraints, field samples |
| Output | Pareto set over (departure time, route) |
| Connects to | §25, §31 |
| Evaluation | Ablation A10 (route-only vs route+time) |
| Status / Tier | Planned / T0 |

---

# 25. Whole-Day Schedule Optimization

## 25.1 Problem

A day's trips interact: leaving college later shifts the gym visit, which shifts dinner. Optimizing each trip independently is suboptimal. The system optimizes the **entire day's trajectory**:

```text
HOME → COLLEGE → GYM → RESTAURANT → HOME
```

Decisions: which route, which departure and arrival times, which gym/restaurant, when to exercise, which mode, whether to postpone or move an outdoor activity indoors.

## 25.2 Formulation

The day is a sequence of activities $j = 1..n$ with locations $L_j$ (possibly a choice set), time windows $[e_j, l_j]$, durations $d_j$, activity intensity $a_j$ and microenvironment $\mu_j$; legs between activities have route and mode choices.

$$
\min_{\pi = (S, T, R, M)} \;\; \rho\big[E_{\text{total}}(\pi)\big] + \lambda_T\, T_{\text{travel}}(\pi) + \lambda_D\, D(\pi) + \lambda_U\, U(\pi)
$$

subject to required destinations, appointment times, opening hours, maximum travel time, mode availability, user preferences and $P(\text{late at any fixed appointment}) \le \varepsilon$. Here $S$ = sequence and location choices, $T$ = times, $R$ = routes, $M$ = modes. $E_{\text{total}}$ includes exposure **during** activities (e.g., the gym visit at high ventilation in a given building), not only during travel.

## 25.3 Method

- Problem size is small (a handful of activities, discrete time slots, few alternatives). Use **dynamic programming over (activity index, discretized time)** with Pareto labels, or a CP-SAT model when constraints are complex.
- Leg costs come from §23/§24 (cached per time slot).
- Top-K plans re-evaluated on joint samples for risk-aware selection.
- **No reinforcement learning** (ADR-013): the problem is a small, fully specified, deterministic-structure optimization with a known model; RL would add sample inefficiency and opacity without benefit.

## 25.4 Destination / location choice

```text
Gym A   Travel 15 min   Exposure high
Gym B   Travel 19 min   Exposure low       ← recommended if the user's weights favour exposure
Gym C   Travel 12 min   Exposure very high
```

Applies to gyms, restaurants, parks, cafés, shopping, workspaces. Destination exposure includes the indoor microenvironment of the destination.

## 25.5 Activity-aware advice

Exercise is where dose rises fastest. Options: different time, different location, indoor exercise in a filtered building, shorter duration, alternative route. Each is evaluated, not assumed.

## 25.6 Component Card — Schedule optimizer

| Question | Answer |
|---|---|
| Real-world problem | Daily activities interact through time; locations are partly substitutable |
| Why simpler is insufficient | Independent per-trip optimization misses interactions (ablation A11) |
| Mathematical structure | Resource-constrained shortest path / DP with time windows; CP-SAT; stochastic re-evaluation |
| Input | Schedule, constraints, alternatives, leg costs, field samples |
| Output | Pareto set of day plans |
| Connects to | §31 selection, §26 counterfactuals, L10 |
| Evaluation | Single-trip vs whole-day reduction at equal travel-time budget; constraint satisfaction |
| Status / Tier | Planned / T1 |

---

# 26. Counterfactual Simulation

## 26.1 Purpose

Answer "what if" questions on the user's own plan:

```text
Current plan → counterfactual modification → alternative plan → paired exposure difference (with interval and probability)
```

- "What if I leave 30 minutes later?" (time shift)
- "What if I take the metro instead?" (mode change)
- "What if I use the other gym?" (location change)
- "What if I stay indoors during the peak?" (activity/microenvironment change, using the dynamic indoor model)

## 26.2 Method

Same engine as optimization: modify $\pi$, evaluate on the same joint samples (paired), report $\Delta E$ distribution, $P(\Delta E < 0)$, and segment attribution.

## 26.3 Assumption

An individual's choices do not change the city's pollution (exogenous field). This holds at individual scale. At city-scale adoption (many users rerouted), routing could shift traffic and emissions; that feedback is listed as Future work (§50).

## 26.4 Status

Planned / T1.

---

# 27. Personalization

## 27.1 Personal digital twin

A continuously updated, on-device personal model that learns regular destinations, typical routes, departure times, modes, activity patterns, typical indoor locations, exposure history, and **willingness to trade time for lower exposure**.

```text
Observed history → pattern detection → personal mobility model
→ future schedule prediction → proactive recommendation
```

## 27.2 Pattern detection

Stay-point detection and place clustering; recurring trip-chain extraction by weekday:

```text
Monday:    Home → College → Gym → Home
Tuesday:   Home → College → Restaurant → Home
Wednesday: Home → College → Gym → Home
```

After sufficient data: *"This is probably your normal Thursday."*

## 27.3 Models (simple first — ADR-019)

- Next-day schedule prediction: frequency / semi-Markov models over places and departure times, with probabilities. Deep sequence models only if they beat these on held-out weeks.
- **Preference learning:** the trade-off weights ($\lambda_T$ etc.) are learned from accepted vs rejected options using a discrete-choice (logit) model with a Bayesian update — revealed preference rather than asking for a number.
- Personal parameters: typical building infiltration (if the user has a personal sensor), personal ventilation scaling.

## 27.4 Learned behaviour

Typical routes, typical travel times, typical activity levels, typical indoor locations, tolerance for extra travel time, preference for lower exposure, repeated destinations.

## 27.5 Closed loop

```text
Predict → Recommend → User acts → Observe trajectory → Compare prediction vs reality
→ Update personal model (and, with personal sensors, exposure model) → Improve next recommendation
```

## 27.6 Component Card — Personalization

| Question | Answer |
|---|---|
| Real-world problem | Users have recurring behaviour and individual trade-offs; asking every day is burdensome |
| Why simpler is insufficient | Fixed weights misrepresent users; no prediction → no proactive help |
| Mathematical structure | Semi-Markov mobility models; discrete-choice Bayesian preference learning |
| Input | On-device trajectory history, accepted/rejected plans |
| Output | Predicted schedules with probabilities; personal weights |
| Connects to | §28 proactive assistant; L9 weights |
| Evaluation | Next-day schedule prediction accuracy on held-out weeks; recommendation acceptance; benefit retained vs user-entered schedules (A14) |
| Status / Tier | Research-only / T2 (T1 demo with synthetic history) |

---

# 28. Proactive Assistant

## 28.1 Reactive vs proactive

| | Reactive | Proactive |
|---|---|---|
| Trigger | User asks ("cleanest route to college?") | System predicts schedule × forecast |
| Inputs | Explicit query | Predicted schedule (§27) + 24–72 h forecast |
| Output | Options + explanation | Notification with a single high-value suggestion |

## 28.2 Proactive trigger rule

Notify only if:

1. predicted schedule probability $\ge p_{\min}$ (it is likely the user makes this trip), **and**
2. expected reduction $\ge r_{\min}$ **and** $P(\text{improvement}) \ge c_{\min}$, **and**
3. the daily notification budget is not exhausted (avoid alert fatigue).

Example:

> "You normally leave for college at 8:15. Tomorrow 8:00–9:00 is predicted to be significantly worse. Leaving at 7:45 is estimated to reduce your exposure by 21% (90% chance it helps)."

> "Your usual Thursday gym trip begins around 18:10. Pollution is predicted to peak 18:00–20:00. Leaving 30 minutes earlier is estimated to reduce exposure by 26%."

## 28.3 Event-driven alerts

Abnormal events (§30) can trigger proactive messages even outside the routine ("Smoke plume from fires is expected over west Delhi this evening; your planned run is affected").

## 28.4 Status

Proactive: Research-only / T2 (T1 demo with a synthetic routine). Reactive: Planned / T0.

---

# 29. Explainability

## 29.1 Requirement

Not *"Route B is optimal"* but *"Route B adds 6 minutes but avoids a high-NO₂ traffic corridor and is predicted to reduce your cumulative exposure by 24%."*

Every major recommendation exposes: **why**, **expected benefit**, **cost/trade-off**, **confidence**, **main factors**.

## 29.2 Explanation object (produced by L9)

```text
recommendation_id
benefit:      ΔE distribution (median, 90% interval), per pollutant
cost:         Δtravel time, Δdistance, Δmode
confidence:   P(improvement), robustness margin, coverage index
attribution:  by segment, by time, by cause, by driver
caveats:      sparse coverage, active event, low indoor information
```

## 29.3 Attribution methods

- **By segment and time:** $\Delta E = \sum_{\text{segments}} \Delta E_s$ (exact, since exposure is additive).
- **By cause:** decompose each segment's $\Delta E$ into concentration difference, duration difference, ventilation difference, microenvironment difference (Shapley-style decomposition of the product $C\cdot\dot V\cdot \Delta t$).
- **By driver:** link high-contribution segments to their driver — traffic corridor (street-GNN emission term), regional background (operator), event (fire/dust), boundary-layer timing.

## 29.4 Faithfulness

Explanations are generated from the attribution object, never invented. Evaluation: every number in the text must match the object (automated check); user comprehension tested in a small study (T2).

## 29.5 Optional natural-language layer (ADR-014)

An LLM may be used **only as an interface**: parsing a free-text schedule into a structured plan, and verbalizing the explanation object. It never computes exposure or makes decisions, and its output is checked against the structured object. Template-based text is the default and the fallback.

## 29.6 Status

Planned / T0 (templates + segment attribution), T1 (cause/driver attribution, optional NL interface).

---

# 30. Event Detection

## 30.1 Problem

Forecasts trained on recurring patterns fail during abnormal episodes. The system must distinguish:

```text
Normal recurring pollution   vs   Abnormal pollution event
```

and adapt forecasting, uncertainty and recommendations.

## 30.2 Event types (India-relevant)

Sudden traffic congestion; industrial releases; dust storms (Thar, pre-monsoon); crop-residue and waste fires; construction; weather inversions; heavy rain (washout); festivals (Diwali fireworks, Bhogi burning); regulatory changes (GRAP restrictions, odd–even); sea-breeze fronts.

## 30.3 Detection methods

| Signal | Method |
|---|---|
| Innovations $y - H(\hat C)$ | Standardized by predictive variance; sustained, spatially coherent large innovations ⇒ event; isolated ⇒ sensor fault |
| Spatial coherence test | Multiple neighbouring/downwind stations vs single station |
| Fire detections (FIRMS) + wind/back-trajectories | Smoke transport events toward the city |
| AOD + wind + Ångström exponent | Dust events |
| Forecast BLH, wind speed | Predicted stagnation/inversion episodes |
| Calendar priors | Diwali, Bhogi, New Year, GRAP announcements |
| Precipitation forecast | Washout (improvement events) |

## 30.4 Source attribution

Emission inversion increments (§16.5), adjoint/gradient sensitivity of the operator ($\partial C_{\text{receptor}}/\partial S$) and back-trajectories attribute an event to a sector/region ("likely upwind fires", "likely local traffic").

## 30.5 Response

Inflate uncertainty; update the source term in assimilation; prefer robust options in optimization; inform the user with the cause and confidence.

## 30.6 Component Card — Event detection

| Question | Answer |
|---|---|
| Real-world problem | Episodes break recurring patterns; sensor faults masquerade as events |
| Why simpler is insufficient | Thresholds on raw concentration confuse faults, events and normal peaks |
| Mathematical structure | Innovation statistics under a predictive distribution; spatial coherence; inversion |
| Input | Observations, forecasts, fires, AOD, calendar |
| Output | Event flags with type, location, probability, attribution |
| Connects to | L2 QC, L4 assimilation, L6 uncertainty inflation, L9 robustness, L10 alerts |
| Evaluation | Precision/recall and lead time on a labelled catalogue of past events (Diwali, stubble seasons, dust storms); fault vs event discrimination |
| Status / Tier | Planned / T1 |

---

# 31. Robust and Multi-Objective Optimization

## 31.1 Multi-objective structure

Users have competing objectives:

```text
Minimize:   exposure · travel time · distance · uncertainty/risk
Subject to: schedule · destinations · transport mode · user constraints
```

The engine returns a **Pareto set**, not one "perfect" route:

```text
Option A   Lowest exposure   +12 min
Option B   Balanced          +5 min
Option C   Fastest           highest exposure
```

Default recommendation: the option maximizing the user's scalarized utility (learned weights, §27.3), or the **knee point** of the front when weights are unknown.

## 31.2 Three distinct optimization criteria

| Criterion | Objective on exposure | When |
|---|---|---|
| **Expected value** | $\mathbb E[E(\pi)]$ | Low uncertainty; repeated daily decisions (averages out) |
| **Risk-aware** | $\rho_{\beta,\alpha}[E] = (1-\beta)\,\mathbb E[E] + \beta\,\mathrm{CVaR}_\alpha[E]$ (also percentile or mean–variance variants) | Default; avoids plans that are good on average but bad in plausible scenarios |
| **Robust (distributionally robust)** | $\max_{Q\in\mathcal A}\mathbb E_Q[E(\pi)]$ over an ambiguity set $\mathcal A$ (e.g., the set of ensemble members, or a Wasserstein ball around the predictive distribution) | When the model itself may be wrong: sparse regions, active events, unseen city |

$\mathrm{CVaR}_\alpha$ = mean of the worst $(1-\alpha)$ fraction of exposure outcomes. This lets the system prefer a route slightly worse on average but much safer under uncertainty.

## 31.3 Chance constraints

$$
P\big(\text{arrival}_j > l_j\big) \le \varepsilon_j \quad \text{for fixed appointments } j
$$

## 31.4 Avoiding double counting

If CVaR is used, the separate uncertainty penalty $U(\pi)$ in the master objective (§33) is restricted to **epistemic coverage** (penalizing plans that depend on regions the model knows little about), or set to zero.

## 31.5 Defining confidence (ADR-011)

Replaces the undefined v1 "Confidence: 87%".

1. **Paired probability of improvement**

$$
\mathrm{Conf}(\pi^*, \pi_0) = P\big(E(\pi^*) < E(\pi_0)\big) \approx \frac{1}{N}\sum_{s=1}^{N} \mathbb 1\big[E^{(s)}(\pi^*) < E^{(s)}(\pi_0)\big]
$$

computed with **both plans evaluated on the same sample $s$** (common random numbers). Unpaired estimates hide that most uncertainty is shared by both plans.

2. **Reduction with a credible interval:** median and 90% interval of $1 - E(\pi^*)/E(\pi_0)$ — e.g., "−28% (−15% to −37%)".

3. **Robustness margin:** how much the field in the most influential region would need to change for the recommendation to flip.

4. **Coverage index:** observation support along the plan (shown as "monitoring coverage: sparse/moderate/dense").

## 31.6 Value of information

> "This recommendation would flip if PM in the eastern section were 20% higher than predicted; monitoring there is sparse."

Computed from per-region sensitivity of $\Delta E$ to field perturbations and the Sobol decomposition (§19.5). Also used to decide where to put campaign sensors.

## 31.7 When not to recommend

If $\mathrm{Conf} < c_{\min}$ (e.g., 0.7) or the reduction interval contains zero: *"The options are not reliably different today — take the one you prefer."* The assistant becomes less assertive, never falsely precise.

## 31.8 Component Card — Risk-aware / multi-objective

| Question | Answer |
|---|---|
| Real-world problem | Competing objectives; uncertain forecasts; heavy-tailed bad outcomes |
| Why simpler is insufficient | Optimizing the single most likely forecast exploits model error and ignores tails |
| Mathematical structure | Multi-objective stochastic optimization; coherent risk measures; DRO; chance constraints |
| Input | Exposure and travel-time samples per plan |
| Output | Pareto set, recommended plan, confidence metrics |
| Connects to | L10 |
| Evaluation | A12: expected-value vs CVaR vs DRO on held-out "reality" (later analysis fields / measurements): mean, P90 exposure, regret; reliability of $\mathrm{Conf}$ |
| Status / Tier | Planned / T0 (Pareto + paired confidence), T1 (CVaR, chance constraints), T2 (DRO, VOI) |

---

# 32. Digital Twin

## 32.1 Concept

The digital twin is not merely a visualization. It is a **continuously synchronized state estimate of the city and the person, plus the ability to simulate their futures under alternative decisions.**

## 32.2 States

**Urban state**

$$
U(t) = \{\mathbf C(x,t),\, W(x,t),\, S(x,t),\, \text{Traffic}(t),\, h(x,t), \dots\}
$$

**Human state**

$$
H(t) = \{x(t),\, m(t),\, a(t),\, \mu(t),\, \text{schedule},\, \text{preferences}, \dots\}
$$

**Exposure state**

$$
P(t) = F\big(U(t), H(t)\big) \quad \text{(cumulative dose to date, per pollutant)}
$$

## 32.3 State-space form

$$
U_{t+1} = \mathcal G_\theta(U_t, a_t) + \eta_t, \qquad y_t = H(U_t) + \varepsilon_t
$$

$$
H_{t+1} \sim p(H_{t+1}\mid H_t, \pi), \qquad P_{t+1} = P_t + \int_t^{t+1} C^{\mu}(x(\tau),\tau)\,\dot V(\tau)\,d\tau
$$

**Synchronization:** assimilation (urban), GPS/activity updates (human). **Simulation:** forward rollout under alternative $\pi$ (counterfactuals, optimization).

## 32.4 Decision

$$
\pi^* = \arg\min_\pi \; \rho\big[P(t_1)\mid \pi\big] + \text{costs}(\pi)
$$

subject to real-world constraints (full form in §33).


---

# 33. Mathematical Formulation (Master)

Synchronized with the component sections. Every line corresponds to a component.

## 33.1 Notation

| Symbol | Meaning | Section |
|---|---|---|
| $\mathbf C(x,t)$ | Multi-pollutant surface concentration field | §14 |
| $\mathbf u, K, h, \Lambda$ | Wind, eddy diffusivity, boundary-layer height, removal rate | §14 |
| $S$ | Emission field (prior $S_{\text{prior}}$, posterior $\hat S$) | §14, §16.5 |
| $\mathcal X_\theta$ | Learned chemistry closure | §16.4 |
| $\mathcal G_\theta$ | Neural operator (one-step evolution) | §17 |
| $y_k, H_k, R_k$ | Observations, observation operators, error covariances | §12 |
| $\mathbf C^{(s)}$ | Joint field sample $s=1..N$ | §19 |
| $\pi$ | Plan: sequence/locations $S$, times $T$, routes $R$, modes $M$, activities | §25 |
| $x(t), m(t), a(t), \mu(t)$ | Position, mode, activity, microenvironment | §20–21 |
| $C^{\mu}$ | Concentration in microenvironment $\mu$ | §21 |
| $\dot V(a)$ | Ventilation rate | §22 |
| $E(\pi)$, $X(\pi)$ | Inhaled dose, concentration-time exposure | §22 |
| $\rho$ | Risk functional (expectation, CVaR blend, or robust) | §31 |
| $T, D, U$ | Travel time, distance, epistemic-coverage penalty | §31, §33.5 |

## 33.2 Estimation (training)

$$
\theta^*, \hat S = \arg\min_{\theta, S}\;
\lambda_d \sum_k \big\|H_k(\hat{\mathbf C}_\theta) - y_k\big\|^2_{R_k^{-1}}
+ \lambda_p \big\|\mathcal R(\hat{\mathbf C}_\theta; \mathbf u, K, h, S, \Lambda, \mathcal X_\theta)\big\|^2_{\Omega_c}
+ \lambda_s \|S - S_{\text{prior}}\|^2_{B^{-1}}
+ \lambda_{\text{sim}} \|\hat{\mathbf C}_\theta - \mathbf C^{\text{sim}}\|^2
+ \lambda_r \mathcal L_{\text{reg}}(\theta)
$$

## 33.3 Dynamics and prediction

$$
\hat{\mathbf C}_{t+1} = \mathcal G_\theta\big(\hat{\mathbf C}_t^{a}, a_t\big), \quad
\hat{\mathbf C}_t^{a} = \text{Analysis}\big(\hat{\mathbf C}_t, \{y_k\}_t\big)
$$

$$
\{\mathbf C^{(s)}\}_{s=1}^N \sim p_\phi\big(\mathbf C_{t:t+H} \mid \hat{\mathbf C}_{t:t+H}^{(\text{ens})}, a, \text{static}\big)
$$

with street-level refinement $\mathbf C^{(s)}_{\text{street}} = \text{GNN}_\psi(\mathcal P \mathbf C^{(s)}, q^{\text{traffic}}, \mathbf u, \text{geom})$.

## 33.4 Exposure

$$
E_i^{(s)}(\pi) = \int_{t_0}^{t_1} C_i^{\mu(t),(s)}\big(x^{(s)}(t), t\big)\,\dot V^{(s)}\big(a(t)\big)\,dt,
\qquad
\frac{dC^{\text{in}}}{dt} = P a\, C^{\text{out}} - (a+k) C^{\text{in}} + S_{\text{in}}/V
$$

## 33.5 Master decision problem

$$
\min_{\pi \in \Pi}\quad
\rho\big[E(\pi)\big]
+ \lambda_T\, \mathbb E[T(\pi)]
+ \lambda_D\, D(\pi)
+ \lambda_U\, U(\pi)
$$

$$
\text{s.t.}\quad
\pi \text{ visits required destinations};\;
P(\text{arrival}_j > l_j) \le \varepsilon_j;\;
\text{opening hours};\;
T(\pi) \le T_{\max};\;
\text{mode feasibility};\;
\text{user preferences}.
$$

- $\rho = (1-\beta)\mathbb E + \beta\,\mathrm{CVaR}_\alpha$ (risk-aware default), $\beta = 0$ (expected value), or $\max_{Q\in\mathcal A}\mathbb E_Q$ (robust).
- $U(\pi)$ = epistemic coverage penalty (e.g., exposure-weighted fraction of the plan in low-coverage regions); set to 0 when the robust form is used (§31.4).
- $\lambda$'s are user-configurable / learned (§27.3). v1's $\alpha E + \beta T + \gamma U$ is the special case $\beta_{\text{risk}}=0$, $\lambda_D = 0$.
- Multi-objective form: return the Pareto set of $(\rho[E], \mathbb E[T], D)$; the scalarization selects the default.

## 33.6 Confidence and reporting

$$
\mathrm{Conf} = \frac1N\sum_s \mathbb 1\big[E^{(s)}(\pi^*) < E^{(s)}(\pi_0)\big],\qquad
\text{Reduction} = \frac{E_{\text{baseline}} - E_{\text{optimized}}}{E_{\text{baseline}}}\times 100
$$

(reduction reported as median and 90% interval over paired samples).

---

# 34. Model Training

## 34.1 Stages

| Stage | What | Data | Output | Tier |
|---|---|---|---|---|
| 0 | Data pipeline, QC, observation operators | §11 | Clean versioned datasets | T0 |
| 1 | Simulation ensemble generation | WRF-Chem (+ CAMS interim), R-LINE/SIRANE, PALM-4U | $\mathbf C^{\text{sim}}$ with coefficient fields | T1 (one city/season) → T2 (four cities) |
| 2 | Operator pretraining | Stage 1 | $\mathcal G_\theta$ (sim) | T1 |
| 3 | Street-GNN pretraining | R-LINE/SIRANE emulation, PALM checks | $\text{GNN}_\psi$ (sim) | T1 |
| 4 | Joint fine-tuning on reality | Stations, satellites, low-cost sensors, mobile campaign; physics residual; emission prior | $\theta, \psi, \hat S$ | T1 (no inversion) / T2 |
| 5 | Uncertainty model | Residuals of Stage 4 on held-out data; met ensembles | $p_\phi$ (generative sampler), ensemble | T1 |
| 6 | Calibration | Held-out period | Conformal layer; recalibration | T1 |
| 7 | Exposure parameter priors | Literature + personal-sensor trips | Microenvironment/ventilation priors | T0 → T1 |
| 8 | Personal models | On-device data | Mobility and preference models | T2 |

## 34.2 Simulation ensemble design

Factors: meteorology (ERA5 EDA members / perturbed physics), emissions (log-normal sector scaling: transport, residential, industry, power, open burning, dust), chemical boundary conditions (CAMS perturbations). Periods per city as in §17.4. Size determined by compute (§46.4).

## 34.3 Training the operator

Multi-step unrolled loss (to 24–72 h) with noise injection for rollout stability; curriculum from sim-only to sim + real + physics; adaptive loss weighting.

## 34.4 Interim plan if WRF-Chem compute is late

Pretrain on CAMS reanalysis/forecasts (physically consistent model output at coarse resolution), fine-tune on observations with the physics residual; replace with WRF-Chem pretraining when available. Recorded in ADR-004.

## 34.5 Hyperparameter optimization

Budgeted Bayesian optimization on the validation split only; the number of trials is reported; the held-out city and test periods are never used for tuning.

## 34.6 Data splits (no random splits — strong autocorrelation)

| Split | Purpose |
|---|---|
| Blocked temporal split (train / validation / test by season-year blocks with gaps) | Forecast skill |
| Leave-station-out (spatial blocks) | Reconstruction in unmonitored places |
| **Leave-one-city-out** (headline: hold out Kolkata) | Transfer to an unseen city |
| Held-out mobile-campaign routes | Street-scale skill |
| Held-out events (e.g., one Diwali, one stubble season) | Event behaviour |

## 34.7 Reproducibility

Config-driven experiments, dataset and model versioning, seeds, logged compute; every number in the paper/demo regenerable from a tagged commit.

---

# 35. Baselines

To prove complexity is justified, compare against progressively stronger baselines.

## 35.1 Field prediction

| ID | Baseline |
|---|---|
| B0 | Persistence (future = current) and diurnal climatology |
| B1 | Classical time series (ARIMA / seasonal statistical models) per station |
| B2 | Standard ML (Random Forest, XGBoost) with met features |
| B3 | Neural temporal model (LSTM, temporal Transformer) per station |
| B4 | Spatiotemporal GNN on stations (no physics) |
| B5 | Physics-informed GNN |
| B6 | **CAMS operational forecast** (and raw WRF-Chem forecast) — the operational reference |
| B7 | **Proposed:** physics-constrained neural operator + street GNN + joint uncertainty |

## 35.2 Spatial reconstruction / downscaling

Inverse-distance weighting; kriging / Gaussian process; LUR; satellite-AOD regression; proposed.

## 35.3 Exposure estimation

Nearest-station (home address) exposure; outdoor-only along trajectory; proposed microenvironment-aware exposure.

## 35.4 Routing / decisions

Shortest time; lowest current AQI along route (static field); expected-value optimization on mean forecast; proposed risk-aware optimization.

## 35.5 Uncertainty

None (point); MC dropout; deep ensemble marginals; marginal conformal; SPDE-GP joint; proposed generative joint sampler + conformal outer layer.

---

# 36. Ablation Studies

Every major research component has an ablation. Primary split for A1–A5: leave-one-city-out.

| ID | Comparison | Hypothesis | Metric |
|---|---|---|---|
| A1 | GNN vs GNN + physics | Physics helps most in the unseen city | RMSE/CRPS on held-out city |
| A2 | Operator vs operator + physics residual | Residual improves generalization and rollout stability | Held-out city error; 72 h stability |
| A3 | GNN + physics vs GNN + physics + operator | Operator adds field-level skill and transfer | Field error, satellite agreement |
| A4 | With vs without learned chemistry closure | Closure reduces winter PM2.5 bias without breaking transport | Seasonal bias, residual |
| A5 | Sim-pretrained vs trained on observations only | Simulation pretraining is necessary for sparse cities | Held-out city error |
| A6 | No downscaling vs LUR vs street GNN | Street layer needed for route differentiation (H2) | Mobile-campaign error; fraction of route decisions confirmed by measurement |
| A7 | No uncertainty vs marginal vs SPDE-GP joint vs generative joint | Joint samples required for calibrated exposure (H3) | Exposure-interval coverage; energy/variogram scores |
| A8 | Outdoor-only vs indoor + outdoor (+ in-vehicle) | Microenvironment modelling changes and improves decisions (H6) | Personal-sensor agreement; decisions changed |
| A9 | Fixed vs dynamic indoor model | Dynamics matter for short peaks | Personal-sensor agreement during peaks |
| A10 | Route-only vs route + time | Time is the larger lever (H4) | Reduction at equal time budget |
| A11 | Single-trip vs whole-day optimization | Interactions matter | Day-level reduction at equal budget |
| A12 | Expected value vs CVaR vs DRO | Risk-aware reduces tails cheaply (H5) | Mean, P90 exposure, regret |
| A13 | Unpaired vs paired confidence | Paired confidence is better calibrated | Reliability of $\mathrm{Conf}$ |
| A14 | User-entered vs predicted schedule | Proactive retains most benefit (H7) | Benefit ratio |
| A15 | Without vs with event detection | Events handled better | Error and coverage during labelled events |
| A16 | Stations only vs + satellites vs + low-cost vs + mobile | Value of each data source | Leave-station-out error |

---

# 37. Evaluation Metrics

## 37.1 Pollution prediction

MAE, RMSE, bias, R², MAPE where appropriate (not near zero), per pollutant, per horizon, per city, per season; spatial error maps; temporal error profiles (diurnal); episode-peak error (timing and magnitude).

## 37.2 Uncertainty calibration

Interval coverage at 50/80/90/95%; PIT; calibration error; NLL; CRPS; energy score; variogram score; reliability of decision confidence.

## 37.3 Physical consistency

Physics-residual magnitude on test data; non-negativity violations; mass-budget closure in the street GNN; agreement with WRF-Chem on held-out simulations.

## 37.4 Exposure estimation

Against personal portable sensors (concentration-time exposure), high-quality reference measurements, and controlled simulations: bias, correlation, interval coverage, per microenvironment.

## 37.5 Routing and decision performance

- Exposure reduction (headline):

$$
\text{Exposure Reduction} = \frac{E_{\text{baseline}} - E_{\text{optimized}}}{E_{\text{baseline}}}\times 100
$$

- Paired probability of improvement and its reliability; additional travel time; distance increase; constraint violations (late arrivals); P90 exposure; regret against hindsight-optimal plans computed on later analysis fields; robustness under prediction uncertainty.
- **Measured reduction:** for a subset of trips, carry sensors on both the original and optimized plans (same day, parallel teams where possible).

## 37.6 Cross-city transfer

Error and calibration on the held-out city vs in-city; few-shot fine-tuning curves (error vs amount of target-city data).

## 37.7 Other components

| Component | Metrics |
|---|---|
| Event detection | Precision, recall, lead time, fault-vs-event accuracy |
| Mode / microenvironment inference | Accuracy, calibration on labelled trips |
| Personalization | Next-day schedule accuracy, acceptance rate |
| Explanations | Numeric faithfulness (automated), comprehension (user study) |
| System | Query latency, forecast cycle time, cost per user |

---

# 38. Failure Modes

| Failure | Detection | Mitigation | User-facing behaviour |
|---|---|---|---|
| Sparse sensor coverage | Coverage index; wide predictive spread | Satellite/low-cost assimilation; robust optimization; VOI to place sensors | "Monitoring is sparse here; confidence lower" |
| Missing sensor data / feed delay | Feed latency monitor; missing mask | Run without them (assimilation handles absence); uncertainty grows | Lower confidence shown |
| Faulty sensor | Flat-line/spike/coherence tests | Exclude; flag | None unless widespread |
| Sudden pollution event | Innovation statistics, fires, AOD, calendar | Inflate uncertainty; update sources; robust selection | Event alert with cause and confidence |
| Weather forecast error | Ensemble spread; verification vs observations | Meteorological ensemble in samples | Confidence reflects spread |
| Wrong boundary-layer height timing | BLH vs radiosonde/ceilometer, morning innovation bias | BLH uncertainty in samples; assimilation | Timing advice given as windows, not exact minutes |
| Emission inventory error | Persistent innovation bias by area/time | Emission inversion | — |
| Sea-breeze front misplaced (Mumbai/Chennai) | Innovation pattern along the coast | Wider uncertainty near fronts; robust option | "Uncertain near the coast this afternoon" |
| Satellite cloud gaps (monsoon) | Missing retrievals | Fall back to stations + model | — |
| Incorrect indoor/outdoor classification | Classification probability; GPS signal | Mixture over microenvironments | "Assumed indoors at college — correct me?" |
| Unknown building ventilation | No building metadata | Wide prior | Indoor estimate shown with wide range |
| Indoor source not observable (cooking, incense) | Not detectable from outside | Prior on indoor sources; optional personal sensor | Explicit caveat |
| GPS drift / urban canyon multipath | Map-matching likelihood | HMM map matching; smoothing | — |
| Incorrect mode inference | Mode probability | Mixture over modes; ask user | "Were you on the metro?" |
| Unseen urban morphology / new city | Distribution-shift detectors on inputs; held-out validation | Physics constraints; few-shot fine-tuning; wider uncertainty | Lower confidence; robust options |
| Model distribution shift (policy change, e.g., GRAP; new metro line) | Rolling calibration monitoring; innovation drift | Adaptive conformal; retraining | Confidence reduced until recalibrated |
| Long-horizon degradation | Spread growth; verification by lead time | Blend to regime climatology beyond 72 h | Categories only for days 3–7 |
| User deviates from route | Live GPS vs plan | Re-plan from current position | Updated suggestion |
| Optimizer finds no feasible plan | Constraint check | Relax soft constraints in order of user priority | Explains which constraint was relaxed |
| Confident but wrong recommendation | Post-hoc check vs later analysis; reliability diagrams | Recalibrate Conf; tighten $c_{\min}$ | — |

---

# 39. Graceful Degradation

The system never fails completely; it becomes **less confident, not falsely precise**.

| Level | Available | System behaviour |
|---|---|---|
| L0 | Full model, all data, GPS, building info | Full personalized prediction and risk-aware plan |
| L1 | Some sensors missing | Assimilate what exists; uncertainty widens locally |
| L2 | Sparse region / major outage | Coarser resolution (operator only, no street layer) + wider uncertainty; robust optimization |
| L3 | Operator unavailable | Fallback chain: CAMS forecast + LUR downscaling → station-based ML (B2) → persistence/climatology; confidence capped |
| L4 | No indoor information | Outdoor estimate + generic infiltration prior + explicit caveat |
| L5 | No GPS | Schedule-based trajectory estimate |
| L6 | No schedule | Location-based advice for the next hours only |
| L7 | Street graph or routing service down | Departure-time advice only |

Each level is labelled in the response metadata and reflected in the confidence text.

---

# 40. Privacy, Safety and Scientific Honesty

## 40.1 Privacy principles

Location history is highly sensitive (home, workplace, routines can be inferred). The system prefers:

- On-device processing wherever possible
- Explicit, granular, revocable consent
- Minimal data retention; no indefinite raw GPS storage
- Aggregated historical patterns rather than raw tracks
- User-controlled tracking (pause, delete, export)
- Clear explanations of what is stored and why
- Compliance with India's **Digital Personal Data Protection Act, 2023**

```text
Preferred:   Raw GPS → on-device preprocessing → trajectory features / plan request → server
Avoided:     Raw GPS history → permanent cloud storage
```

## 40.2 Technical measures

- Route queries can be made with coarse or obfuscated endpoints; detailed corridor fields can be downloaded and exposure integrated on device (§41.3).
- Personalization models live on device; only opt-in aggregates leave it.
- Any city-level mobility analytics use aggregation with minimum group sizes and, in the future, differential privacy.

## 40.3 Safety and scientific honesty

- Estimated exposure is never presented as a clinical measurement.
- Use: estimated exposure, predicted concentration, model confidence, uncertainty, approximate reduction.
- Avoid: "You inhaled exactly 37.2 µg of PM2.5" unless the method supports that precision (display rounding tied to uncertainty).
- "Low exposure" never becomes "safe".
- Recommendations are decision support, not medical advice; users with health conditions are pointed to medical guidance.
- The system never recommends unsafe behaviour (e.g., a route through unsafe areas at night, or skipping a medical appointment) to lower exposure; safety-related constraints are hard constraints.

---

# 41. Deployment Architecture

## 41.1 Offline / training layer

| Computation | Why here |
|---|---|
| Historical data ingestion, QC | Large volumes, batch |
| WRF-Chem / R-LINE / SIRANE / PALM simulations | HPC, hours–weeks |
| Operator, GNN, generative-model training; physics-informed fine-tuning; emission inversion (offline variant) | GPUs, long jobs |
| Hyperparameter optimization, evaluation, ablations | Batch |
| Calibration fitting | Periodic |

## 41.2 Near-real-time inference layer (server, hourly cycle)

| Computation | Why here |
|---|---|
| Observation ingestion, QC, event detection | Shared by all users |
| Assimilation + operator rollout × met ensemble | City-scale, independent of user count |
| Generative sampling of $N$ joint fields | Shared; GPU |
| Tiles of field samples / summaries published | Cacheable |
| On-demand corridor refinement (street GNN) | Shared across users on the same corridors; cached |
| Routing and schedule optimization (optional server mode) | Needs graph + samples |

## 41.3 On-device layer

| Computation | Why here |
|---|---|
| GPS processing, stay points, map matching, mode inference | Raw location stays private |
| Personal mobility and preference models | Privacy; personal |
| Exposure integration along own trajectory | Needs private trajectory; cheap given downloaded samples |
| Notification scheduling (proactive) | Personal routine stays private |
| Optional: routing on a downloaded regional graph + sample tiles | Strongest privacy mode |

## 41.4 Data flow

```text
[Offline]  data archives + simulations → training → model registry
                                                  ↓
[Server, hourly] observations → QC/events → assimilation → operator × ENS
                → generative samples → tiles (+ corridor refinement on demand)
                                                  ↓  (tiles, summaries)
[Device]  GPS/schedule/prefs → trajectory & plan candidates → exposure integration
          → (local or server) optimization → explanation → user → feedback (local)
```

## 41.5 Cost note

City-level inference cost is fixed per cycle and per city; per-user cost is routing and integration, which is small. Storage of $N$ samples × 72 h × grid is managed by compression (store low-rank/latent representations or regenerate samples from the sampler's seed on demand).

---

# 42. Scalability

## 42.1 Growth path

```text
One user (demo) → thousands of users (one city) → city-scale deployment → multiple cities
```

## 42.2 What scales how

| Dimension | Approach |
|---|---|
| Users | Shared city fields; per-user cost is routing/integration; cache corridors; on-device work |
| Cities | Operator transfer (same physics, new coefficient fields); few-shot fine-tuning; city tiers by data availability |
| Sparse-data cities | Simulation pretraining + satellites + physics; wider uncertainty; VOI-guided sensor siting |
| Different morphologies | Geo-FNO handles geometry; street GNN pretrained on street-model emulation for the new city's network |
| Different sensor densities | Observation-operator formulation is agnostic to which sensors exist |
| Compute | Simulation is the dominant one-time cost per new city; inference is cheap |

## 42.3 Transfer learning and domain adaptation

- Leave-one-city-out results define expected zero-shot quality.
- Few-shot curves define how much local data is needed.
- Input-distribution shift detectors trigger wider uncertainty in new conditions.

## 42.4 Research prototype vs production

| Aspect | Research prototype (T1/T2) | Production (T3) |
|---|---|---|
| Cities | 4 | Many Indian cities |
| Users | Team + pilot users | Thousands+ |
| Forecast cycle | Hourly, may be manual | Automated, monitored, SLAs |
| Simulations | Selected seasons | Continuous re-simulation as inventories update |
| Data agreements | Research access | Licensed feeds (traffic, SAFAR, low-cost networks) |
| Privacy | Consent forms, local storage | Full DPDP compliance, audits |
| Monitoring | Manual | Calibration dashboards, drift alerts, on-call |


---

# 43. MVP (T0)

**Goal:** a reliable end-to-end demonstration of the core idea — personal exposure along a plan, optimized over route and departure time, with honest confidence — in **one city (Delhi)**, independent of the slow research components.

```text
Stations + ERA5/IFS + CAMS
        ↓
Field model: station ML (XGBoost) + CAMS background, ensemble for uncertainty
        ↓
LUR downscaling (OSM road features)
        ↓
Pollution field samples (PM2.5)
        ↓
Planned trajectory + fixed microenvironment factors + activity ventilation
        ↓
Exposure distribution per plan
        ↓
Route + departure-time Pareto optimization, paired confidence
        ↓
Template explanations + animated field visualization
```

| Included | Excluded (later tiers) |
|---|---|
| PM2.5, Delhi | Other pollutants, other cities |
| CPCB stations, ERA5/IFS, CAMS, OSM | Satellites, low-cost sensors, simulations |
| Station ML + CAMS + LUR, ensemble uncertainty | Operator, physics, street GNN, generative sampler |
| Fixed infiltration factors, activity ventilation | Dynamic indoor model, microenvironment inference |
| Route + time optimization, Pareto, paired confidence | Whole-day, CVaR, DRO, counterfactuals |
| Template explanations, AQI display | Personalization, proactive mode |

The MVP is also the **degradation fallback** (L3, §39) of the full system, so none of it is throwaway.

---

# 44. Competition Version (T1)

**Goal:** demonstrate the research architecture working end to end, with the components judges will find distinctive, while keeping the MVP as a fallback.

| Area | Included |
|---|---|
| Cities | Delhi (full) + **Kolkata zero-shot/few-shot demonstration** (held out); Mumbai/Chennai if time allows |
| Pollutants | PM2.5, NO₂ (+ O₃ for the NO₂–O₃ trade-off) |
| Field model | **Neural operator** (Geo-FNO) pretrained on CAMS + one WRF-Chem season for Delhi; hard constraints + PDE residual (with BLH dilution); assimilation step |
| Street scale | Street-network GNN pretrained on R-LINE in the demo corridors; LUR baseline |
| Uncertainty | Met ensemble × model ensemble × generative sampler (or SPDE-GP if the sampler is not ready); adaptive conformal outer layer |
| Exposure | Dynamic indoor model; in-vehicle factors by mode; activity ventilation |
| Decisions | Route + time + mode + destination + whole-day schedule; CVaR; chance constraints; Pareto A/B/C; counterfactual "what if" |
| Events | Fire/dust/Diwali detection with uncertainty inflation |
| Assistant | Explanations with segment/cause/driver attribution; proactive demo using a synthetic routine |
| Validation | Pilot mobile campaign on demo corridors; personal-sensor trips on original vs optimized plans |
| Key results | Baseline table (B0–B7), ablations A1, A2, A6, A7, A8, A10, A11, A12 (on available data) |

### Key demo scenario

1. User enters `Home → College → Gym → Restaurant → Home`.
2. The system loads current and predicted pollution, weather, traffic, the urban graph and the schedule.
3. It shows the original plan's estimated dose, the Pareto options A/B/C, the recommended plan with reduction, extra time, $P(\text{improvement})$ and the reason.
4. The animated field evolves through the day with the trajectory drawn through it; the lower-exposure corridor and the shifted departure are visible.
5. A counterfactual question ("what if I take the metro?") is answered live.
6. Evidence slide: measured exposure on original vs optimized plans from the campaign trips; calibration plot; Kolkata held-out result.

```text
           POLLUTION FIELD (evolving)
🟢 🟢 🟡 🔴
🟢 🟡 🔴 🔴
🟢 🟢 🟡 🔴

      USER TRAJECTORY
A ───────────────→ B
       ↓
   lower-exposure corridor + shifted departure
```

---

# 45. Research Version (T2)

Adds, on top of T1:

- WRF-Chem ensembles for all four cities and seasons; full **leave-one-city-out** study.
- Learned chemistry closure; **emission inversion** with published corrected emission maps.
- PALM-4U neighbourhood simulations; street-model validation.
- Full mobile campaign (one city) + calibration campaigns (three cities).
- Generative joint uncertainty with full emission posterior; Sobol decomposition; value of information.
- Distributionally robust optimization.
- Personal digital twin: pattern detection, preference learning, proactive assistant, closed loop.
- User study on comprehension and acceptance.
- Exposure history and trends.

---

# 46. Roadmap

Dates depend on the competition deadline, team size and compute (open decisions §46.4). The roadmap is therefore expressed as phases with **exit gates**. Phases run in parallel across workstreams.

## 46.1 Workstreams

| WS | Name | Phases |
|---|---|---|
| A | Data & fusion | 1, 2 |
| B | Simulation | 5S |
| C | Field model (operator, physics, GNN) | 3, 4, 5, 6 |
| D | Uncertainty | 7 |
| E | Human & exposure | 8, 9, 10 |
| F | Decisions | 11, 12, 13 |
| G | Assistant, product & demo | 13A, 14, 16 |
| H | Field campaign | 15C |

## 46.2 Phases

| Phase | Name | Deliverable | Exit gate | Tier |
|---|---|---|---|---|
| 1 | Problem definition | Formal system specification (this document), city/pollutant/resolution/horizon/exposure metric decisions | Spec v2 agreed | T0 |
| 2 | Data pipeline | Ingestion (CPCB, ERA5/IFS, CAMS, OSM; then satellites, low-cost), QC, observation operators, versioned datasets | One year of clean Delhi data; QC report | T0 |
| 3 | Urban representation | Hierarchical grids, road/transit graph, static features, mapping operators, wind-conditioned edges | Graph + grids for Delhi; then other cities | T0/T1 |
| 4 | Baseline forecasting | B0–B4, B6 + LUR downscaling | Baseline benchmark table | T0 |
| 5S | Simulation | WRF-Chem configuration and validation (Delhi winter first), R-LINE in demo corridors; then remaining cities/seasons, SIRANE, PALM | Simulated fields validated against stations | T1 → T2 |
| 5 | Physics-informed model | Hard constraints, PDE residual with BLH term, coefficient-field pipeline; physics-informed GNN (B5) | A1 result | T1 |
| 6 | Neural operator | Geo-FNO pretrained (CAMS → WRF-Chem), fine-tuned with data + physics; assimilation step; street GNN; closure (T2) | A2, A3, A5 results; Kolkata held-out result | T1 |
| 7 | Uncertainty | Ensembles, met ensemble, generative sampler / SPDE-GP, conformal, coverage index | Calibration table (field, joint, exposure) | T0 → T1 |
| 8 | Human mobility | Planned trajectories (T0); GPS processing, map matching, mode inference (T1) | Mode accuracy on labelled trips | T0/T1 |
| 9 | Indoor/outdoor model | Fixed factors (T0); dynamic model, classification, in-vehicle factors (T1) | A8/A9 results | T0/T1 |
| 10 | Exposure model | Dose and concentration-time integration on samples, attribution | Validation vs personal sensors | T0 |
| 11 | Routing | Time-dependent multi-criteria routing + stochastic evaluation | Route benchmark vs baselines | T0 |
| 12 | Time optimization | Joint departure-time + route, chance constraints | A10 result | T0 |
| 13 | Whole-day schedule | DP/CP-SAT with location alternatives and modes; CVaR | A11, A12 results | T1 |
| 13A | Counterfactuals & explanations | What-if engine; attribution; templates; optional NL interface | Faithfulness check passes | T0/T1 |
| 13B | Event detection | Innovation-based detection, fire/dust/festival signals | Event catalogue evaluation | T1 |
| 14 | Personalization & proactive | Pattern detection, preference learning, proactive triggers (synthetic in T1) | A14 result | T2 |
| 15 | Closed-loop evaluation | Predicted → recommended → observed → error → updated model | Adaptive-personalization demonstration | T2 |
| 15C | Field campaign | Sensor procurement, co-location, pilot corridors (T1), full campaign (T2), personal-sensor trips | Street-scale and exposure validation datasets | T1/T2 |
| 16 | Demo & submission | Web demo, evidence slides, report | Demo runs on fallback (T0) and full (T1) paths | T1 |

## 46.3 Critical path

Data pipeline (2) → baselines (4) → exposure + routing + time (10–12) = **MVP**. In parallel: simulation (5S) → operator (6) → uncertainty (7) → whole-day (13) = **competition version**. The field campaign (15C) must start early because procurement and co-location take weeks.

## 46.4 Open decisions and blockers

| Item | Status | Impact |
|---|---|---|
| Compute access (HPC allocation, e.g., National Supercomputing Mission PARAM systems via academic affiliation; or cloud credits; ≥1 serious GPU) | **Open** | Size of WRF-Chem ensemble; operator training |
| Competition deadline and judging criteria | **Open** | Phase dates; T1 scope |
| Team size and roles | **Open** | Parallel workstreams |
| Campaign city (Delhi vs Kolkata) | **Open** | Delhi: more existing data; Kolkata: largest information gain |
| Data agreements: SAFAR, traffic speeds (TomTom/HERE), low-cost networks | **Open** | Street-layer quality |
| Budget for sensors and traffic data | **Open** | Campaign scale |
| Verify station counts per city; GEMS coverage of Mumbai; NAQI breakpoints | **Open** | Data plan accuracy |
| Development environment network access to data hosts (CPCB, OpenAQ, Copernicus CDS/ADS, FIRMS, Overpass, UrbanEmissions, GEMS) | **Blocked** in current environment | Ingestion development |
| Current dev container: 4 CPU, 15 GB RAM, no GPU | Known | Suitable for code and small tests only |

---

# 47. Feature Matrix

Priority: Critical / High / Medium / Low. MVP? = in T0. Research? = part of the research contribution.

| Feature | Purpose | Model / method | Input | Output | Priority | MVP? | Research? | Status |
|---|---|---|---|---|---|---|---|---|
| Station ingestion & QC | Clean ground truth | Rules + coherence tests | CPCB/OpenAQ | QC'd obs | Critical | Yes | No | Planned |
| Satellite ingestion | Spatial coverage | Observation operators (AK, AOD link) | TROPOMI, MAIAC, INSAT, GEMS | $y_k, H_k$ | High | No | Yes | Planned (T1) |
| Low-cost sensor calibration | Density | RH correction + co-location regression | Sensor + reference | Calibrated obs | Medium | No | Yes | Planned (T1) |
| Data fusion via observation operators | Coherent state from heterogeneous data | Assimilation objective | All obs | Analysis state | Critical | Partial | Yes | Planned |
| Hierarchical representation | Resolution where needed | Nested grids + road graph | OSM, buildings | Grids, graph, mappings | Critical | Partial | Yes | Planned |
| Wind-conditioned graph edges | Transport direction | Dynamic edge weights | Wind | Edge weights | High | No | Yes | Planned (T1) |
| WRF-Chem simulation ensemble | Full-field ground truth | WRF-Chem (MOZART-MOSAIC-VBS) | ERA5, inventories, CAMS BCs | $\mathbf C^{\text{sim}}$ | Critical | No | Yes | Planned (T1 one city) / Research (T2) |
| Street-model simulations | Street-scale ground truth | R-LINE / SIRANE / PALM-4U | Traffic, geometry, met | Street fields | High | No | Yes | Planned (T1 R-LINE) / Research |
| Pollution forecasting | Predict future field | Operator rollout (T1); station ML + CAMS (T0) | State, met forecast | Fields 0–72 h | Critical | Yes | Yes | Planned |
| Neural operator | Field evolution, transfer | Geo-FNO, autoregressive | Field + coefficient fields | Next field | High | No | Yes | Planned — committed (ADR-003) |
| Physics constraints (hard) | Physical consistency | Non-negativity, flux form, BCs | — | Constrained fields | High | No | Yes | Planned (T1) |
| PDE residual loss | Physics between observations | PINO residual with BLH term | Fields, coefficients | Loss | High | No | Yes | Planned (T1) |
| Learned chemistry closure | Secondary aerosol | Small network in PDE | Fields, T, RH, … | Source term | Medium | No | Yes | Research (T2) |
| Emission inversion | Correct inventories | Joint optimization of $S$ | Obs, prior | $\hat S$ | Medium | No | Yes | Research (T2) |
| Station-level ST-GNN | Baseline | GNN + temporal encoder | Station obs, met | Station forecasts | High | No | Yes | Planned (baseline) |
| LUR downscaling | Street gradients (baseline) | Regression | City field, OSM features | Street field | Critical | Yes | No | Planned (T0) |
| Street-network GNN | Street-scale field | Flux-form message passing | Background, traffic, wind, geometry | Street field | High | No | Yes | Planned (T1) |
| Multi-pollutant modelling | Pollutant-specific exposure | Species vector + coupling | Obs, sim | Per-pollutant fields | High | PM2.5 only | Yes | Planned |
| AQI calculation | Communication | CPCB NAQI on samples | Concentrations | AQI + category probabilities | Medium | Yes | No | Planned |
| Uncertainty (ensembles) | Confidence | Deep + met ensembles | Model, ENS | Samples | Critical | Yes | Yes | Planned |
| Generative joint sampler | Correlated field uncertainty | Diffusion / flow matching (SPDE-GP baseline) | Mean field, met, static | Joint samples | High | No | Yes | Planned (T1) |
| Conformal outer layer | Coverage guarantee | Adaptive conformal | Exposure scores | Calibrated intervals | High | No | Yes | Planned (T1) |
| Sparse-region / coverage index | Know when uncertain | Observation-support metric | Obs locations, wind | Coverage map | High | Yes | Yes | Planned |
| Event detection | Abnormal episodes | Innovation statistics, fires, AOD, calendar | Obs, forecasts | Event flags | High | No | Yes | Planned (T1) |
| Source attribution | Explain events | Inversion increments, sensitivities | Model, obs | Sector/region attribution | Medium | No | Yes | Research (T2) |
| Planned trajectory model | Human state | Time-indexed path with travel-time distributions | Plan, graph, traffic | $p(x(t)\mid\pi)$ | Critical | Yes | No | Planned |
| GPS processing & map matching | Observed trajectories | HMM | GPS | Matched path | High | No | No | Planned (T1) |
| Mode inference | Mode-specific exposure | Probabilistic classifier | GPS, accel | $p(m)$ | Medium | No | No | Planned (T1) |
| Microenvironment classification | Indoor/outdoor/vehicle | Probabilistic classifier | GPS, POIs, buildings, signals | $p(\mu)$ | High | No | Yes | Planned (T1) |
| Indoor model | Indoor concentration | Mass-balance ODE (fixed factors in T0) | Outdoor samples, building type | Indoor samples | High | Fixed factors | Yes | Planned |
| In-vehicle model | Mode exposure | Mass balance / factors by mode | Outdoor samples, mode | In-vehicle samples | High | Fixed factors | Yes | Planned |
| Activity / ventilation | Dose | EFH-based rates | Activity | $\dot V$ | Critical | Yes | No | Planned |
| Exposure model | Personal exposure | Path integral, Monte Carlo | Samples, trajectories | $p(E)$ per pollutant | Critical | Yes | Yes | Planned |
| Exposure history & trends | Long-term awareness | Aggregation | Observed trajectories | Trends | Low | No | No | Future/T2 |
| Route optimizer | Decision support | TD multi-criteria label setting + stochastic evaluation | Graph, samples | Pareto routes | Critical | Yes | Yes | Planned |
| Departure-time optimizer | Biggest lever | Joint time × route search, chance constraints | Window, samples | Pareto (time, route) | Critical | Yes | Yes | Planned |
| Mode comparison | Mode choice | Same engine over modes | Modes | Pareto | High | No | No | Planned (T1) |
| Destination choice | Location alternatives | Choice set in schedule DP | POIs | Ranked alternatives | Medium | No | No | Planned (T1) |
| Schedule optimizer | Whole-day planning | DP / CP-SAT + stochastic re-evaluation | Schedule, constraints | Pareto day plans | High | No | Yes | Planned (T1) |
| Risk-aware optimization | Tail protection | CVaR blend, chance constraints | Samples | Risk-aware plan | High | No | Yes | Planned (T1) |
| Robust optimization (DRO) | Model misspecification | Ambiguity sets | Ensemble/samples | Robust plan | Medium | No | Yes | Research (T2) |
| Multi-objective Pareto | Realistic trade-offs | Pareto set + knee/scalarization | Objectives | Options A/B/C | Critical | Yes | No | Planned |
| Paired confidence | Decision confidence | Common-random-number Monte Carlo | Samples | $P(\text{improve})$, CI | Critical | Yes | Yes | Planned |
| Value of information | Explain uncertainty, site sensors | Sensitivity / Sobol | Samples | VOI statements | Medium | No | Yes | Research (T2) |
| Counterfactual simulation | What-if answers | Plan perturbation + paired eval | Plan | $\Delta E$ distribution | High | No | No | Planned (T1) |
| Explainability | Trust | Additive attribution + templates | Decision outputs | Explanation object/text | Critical | Yes | No | Planned |
| NL interface (optional) | Free-text input/output | LLM, interface only | Text, explanation object | Structured plan / text | Low | No | No | Experimental |
| Personalization | Recurring behaviour | Semi-Markov + discrete choice | On-device history | Predicted schedule, weights | Medium | No | Yes | Research (T2) |
| Proactive assistant | Unprompted help | Trigger rule | Predicted schedule, forecast | Notifications | Medium | No | Yes | Research (T2; synthetic in T1) |
| Closed-loop adaptation | Improvement over time | Bayesian updates | Observations | Updated models | Medium | No | Yes | Research (T2) |
| Graceful degradation | Robust service | Fallback ladder | Availability state | Labelled outputs | High | Yes | No | Planned |
| Privacy (on-device) | Protect users | On-device processing | GPS | Features only | Critical | Yes | No | Planned |
| Field visualization | Understanding | Animated maps + uncertainty | Samples, plan | UI | High | Yes | No | Planned |
| Mobile monitoring campaign | Street truth & validation | Calibrated instruments | — | Dataset | High | No | Yes | Planned (T1 pilot) / Research |
| Personal-sensor validation | Exposure truth | Portable sensors | — | Dataset | High | No | Yes | Planned (T1) |

---

# 48. Architecture Decision Log

Format: **Decision** · Why considered · Problem solved · Alternatives · Why rejected · Evidence required · Status.

**ADR-001 — Personal exposure (dose), not ambient AQI, is the optimization target**
Why considered: core concept. Problem: AQI at a point ≠ what a moving person breathes. Alternatives: AQI-based routing. Rejected because: ignores time, mode, microenvironment, breathing. Evidence: A8, A10, personal-sensor validation. Status: Accepted.

**ADR-002 — Four target cities: Delhi, Kolkata, Mumbai, Chennai**
Why considered: user decision; scientific value. Problem: need distinct regimes to test generalization. Alternatives: one city. Rejected because: cannot test transfer (RQ1). Evidence: leave-one-city-out. Status: Accepted; Delhi first for MVP.

**ADR-003 — Neural operator is a committed core field model**
Why considered: field-to-field PDE evolution with city-varying coefficients; need fast assimilating ensembles. Problem: WRF-Chem too slow for real time; station models produce no fields. Alternatives: GNN-only; CNN/U-Net; running WRF-Chem operationally; treating the operator as an optional experiment. Rejected because: GNN-only lacks field/transfer structure; CNN tied to a grid; WRF-Chem ensembles too costly in real time; project decision to build it as core. Evidence: A2, A3, A5 and the held-out city result must show its value; if it does not beat B5, that is reported honestly and the fallback chain (§39) remains. Status: Accepted (committed).

**ADR-004 — Simulator ensembles as primary operator ground truth; CAMS as interim**
Why considered: no fully observed real field exists. Problem: operator needs dense supervision. Alternatives: interpolated station fields; observations only. Rejected because: interpolated fields teach the interpolation method; observations are too sparse for function-space learning. Evidence: A5. Status: Accepted.

**ADR-005 — Fusion through observation operators inside the estimation objective**
Problem: heterogeneous instruments measure different quantities. Alternatives: pre-merged gridded product; simple concatenation. Rejected because: pre-merging hides uncertainty and bakes in interpolation errors. Evidence: A16, leave-station-out. Status: Accepted.

**ADR-006 — 2-D mixed-layer PDE with boundary-layer-height dilution as the physics constraint**
Problem: v1 PDE omitted BLH, the main control of diurnal PM. Alternatives: v1 constant-diffusion PDE; full 3-D PDE. Rejected because: v1 misses the key mechanism; 3-D is too costly for the emulator. Evidence: A2; residual vs WRF-Chem surface fields. Status: Accepted.

**ADR-007 — Learned chemistry closure in the PDE**
Problem: secondary aerosol is nonlinear and unresolved. Alternatives: ignore chemistry; full chemical mechanism. Rejected because: ignoring penalizes correct predictions; full mechanism too slow/stiff. Evidence: A4. Status: Accepted (T2).

**ADR-008 — Street-network GNN in flux form for street scale; LUR as baseline**
Problem: route choice needs 10–100 m gradients. Alternatives: LUR only; CNN super-resolution; no downscaling. Rejected because: LUR lacks wind-direction dynamics and inter-street exchange; CNN mismatches network geometry; no downscaling makes routes indistinguishable. Evidence: A6. Status: Accepted (T1); LUR in T0.

**ADR-009 — Joint uncertainty via conditional generative sampler (SPDE-GP baseline)**
Problem: exposure integrates correlated errors. Alternatives: marginal intervals (ensembles/conformal only); Gaussian process only. Rejected because: marginals mis-state exposure uncertainty; GP misses plume/front structure. Evidence: A7, energy/variogram scores, exposure coverage. Status: Accepted (T1; SPDE-GP fallback).

**ADR-010 — Conformal prediction as an outer calibration layer only**
Problem: finite-sample coverage under drift. Alternatives: conformal as the main UQ method. Rejected because: produces marginals only. Evidence: coverage on held-out periods. Status: Accepted.

**ADR-011 — Confidence = paired $P(E_{\text{opt}} < E_{\text{orig}})$ + credible interval + robustness margin**
Problem: v1 "Confidence 87%" undefined. Alternatives: model accuracy %; unpaired probability; interval width. Rejected because: not decision-relevant or overstated uncertainty. Evidence: A13 reliability. Status: Accepted.

**ADR-012 — Risk-aware objective (CVaR blend) with chance constraints by default; DRO in sparse/event conditions**
Problem: tails matter; forecasts uncertain; model may be wrong. Alternatives: expected value only; worst case only. Rejected because: expected value ignores tails; pure worst case too conservative. Evidence: A12. Status: Accepted (T1), DRO (T2).

**ADR-013 — No reinforcement learning for routing/scheduling**
Problem: choose plans. Alternatives: RL policy. Rejected because: small, fully specified optimization with a known model; exact DP/CP-SAT is optimal, transparent and sample-free. Evidence: none required unless the problem changes (e.g., city-scale multi-user control). Status: Rejected (RL).

**ADR-014 — LLM only as an optional interface**
Problem: free-text schedules and natural explanations. Alternatives: LLM as planner/explainer; no NL. Rejected because: LLM decisions are unverifiable and may hallucinate numbers. Evidence: faithfulness checks. Status: Experimental.

**ADR-015 — Indian National AQI for display; concentrations/dose for optimization**
Problem: users understand AQI; AQI is a max over sub-indices with averaging windows unsuited to optimization. Alternatives: optimize AQI; US AQI. Rejected because: non-additive, wrong time scale; not the Indian standard. Status: Accepted.

**ADR-016 — Own mobile monitoring and personal-sensor campaign**
Problem: no public street-level or personal-exposure ground truth. Alternatives: synthetic validation only. Rejected because: cannot validate RQ2/RQ6. Evidence: campaign data quality. Status: Accepted (pilot T1, full T2).

**ADR-017 — Hierarchical resolution with corridor-adaptive refinement**
Problem: uniform high resolution is too costly; uniform coarse is useless for routes. Alternatives: single resolution. Status: Accepted.

**ADR-018 — On-device trajectory processing and personalization**
Problem: location privacy. Alternatives: cloud processing. Rejected because: privacy risk; DPDP Act. Status: Accepted.

**ADR-019 — Simple personalization models first**
Problem: predict routines and preferences. Alternatives: deep sequence models from the start. Rejected because: little per-user data; complexity must be earned. Evidence: A14 vs deep alternatives when data exists. Status: Accepted.

**ADR-020 — Temporal dynamics inside the operator (autoregressive), not a separate Transformer/LSTM**
Problem: temporal forecasting. Alternatives: separate temporal Transformer. Rejected because: duplicates dynamics already represented by the operator; kept as baseline B3. Evidence: baseline comparison. Status: Accepted.

**ADR-021 — Exposure units: inhaled dose in µg (primary), concentration-time in µg·h/m³ (secondary)**
Problem: v1 "units" undefined. Alternatives: AQI-hours; composite health index. Rejected because: not physically meaningful / not evidence-based. Status: Accepted.

**ADR-022 — 2-stage routing (deterministic Pareto search on mean, stochastic evaluation on samples)**
Problem: stochastic time-dependent multi-objective routing is expensive. Alternatives: fully stochastic search; mean-only. Rejected because: too slow / ignores uncertainty. Evidence: regret vs exhaustive stochastic search on small instances. Status: Accepted.

**ADR-023 — No foundation-model pretraining at present**
Problem: could pretrained atmospheric foundation models help? Alternatives: fine-tune an existing global foundation model. Status: Deferred (Future) — revisit if a suitable open model with air-quality variables and permissive license is available and beats our operator on B-comparisons.

---

# 49. Open Research Questions

1. How well does a physics-constrained operator transfer to an unseen Indian city, and how much local data restores in-city skill?
2. Which physics mechanism (simulator pretraining, hard constraints, PDE residual, closure) contributes most to transfer?
3. How accurate is the 2-D mixed-layer reduction against 3-D WRF-Chem for surface exposure purposes?
4. Can emission inversion from stations + satellites meaningfully correct Indian city inventories, and are the corrections stable across seasons?
5. How large are street-scale gradients relative to temporal variability in each city, and when does route choice matter at all?
6. Are generative joint samples calibrated for path integrals at street scale, and what is the minimum $N$ for stable decisions?
7. What are realistic infiltration factors and in-vehicle ratios for Indian buildings and modes, and how much do they vary?
8. How often does risk-aware optimization change decisions, and at what expected cost?
9. How reliable is the paired confidence in practice, and how should it be communicated?
10. Can predicted routines support proactive advice without excessive false alarms?
11. Which data source (satellite, low-cost, mobile) gives the largest value of information per rupee for a new city?

---

# 50. Future Work

- City-scale feedback: many users rerouted could shift traffic and emissions (game-theoretic / equilibrium routing).
- Building-specific indoor models from smart sensors and building metadata.
- Personal sensors integrated into the closed loop for individual calibration.
- Health-outcome-informed exposure weighting (only with epidemiological evidence).
- Additional cities and automated new-city onboarding.
- Foundation-model pretraining (ADR-023).
- Policy-level use: evaluating GRAP measures, sensor siting by value of information.
- Indoor air-quality advice (ventilation timing, purifier use) beyond travel.
- Accessibility and multilingual interfaces (Hindi, Bengali, Marathi, Tamil).

---

# 51. Final Architecture Diagram

```text
╔═══════════════════════════════════════════════════════════════════════════════╗
║                        MULTI-SOURCE WORLD STATE                               ║
║ CAAQMS │ low-cost │ satellites (TROPOMI, MAIAC, INSAT, GEMS) │ ERA5/IFS ENS   ║
║ inventories (EDGAR, APnA, SAFAR, FINN) │ traffic (OSM, speeds, ARAI)           ║
║ buildings (Open Buildings 2.5D) │ simulations (WRF-Chem, R-LINE/SIRANE, PALM)  ║
║ own mobile & personal-sensor campaigns                                         ║
╚══════════════════════════════════════╤════════════════════════════════════════╝
                                       ↓
              DATA FUSION / QC  — observation operators H_k, errors R_k
                                       ↓
            ┌──────────────────────────────────────────────────┐
            │ URBAN SPATIOTEMPORAL REPRESENTATION              │
            │ Regional → city grid → corridor graph → microenv │
            │ Wind-conditioned edges · coefficient fields      │
            └──────────────────────────┬───────────────────────┘
                                       ↓
     ┌───────────────────────────────────────────────────────────────────┐
     │ DYNAMIC POLLUTION ENGINE                                          │
     │  Neural operator (Geo-FNO, autoregressive, assimilating)          │
     │   + Physics: hard constraints · PDE residual (advection, diffusion,│
     │     BLH dilution, deposition, washout) · learned chemistry closure │
     │     · emission inversion                                          │
     │   + Street-network GNN (flux form)                                │
     └──────────────────────────────┬────────────────────────────────────┘
                                    ↓
              FUTURE POLLUTION FIELDS (0–72 h, multi-pollutant, AQI)
                    ←──── EVENT DETECTION (innovations, fires, dust, calendar)
                                    ↓
              UNCERTAINTY: met ENS × model ensemble × generative sampler
              → N joint space-time samples (+ conformal outer layer)
                                    ↓
     ┌───────────────────────────────────────────────────────────────────┐
     │ HUMAN DIGITAL TWIN (on device where possible)                     │
     │  GPS trajectory · schedule · mode · activity · microenvironment   │
     │  building context · routines · preferences                       │
     └──────────────────────────────┬────────────────────────────────────┘
                                    ↓
              PERSONAL EXPOSURE MODEL
              indoor/in-vehicle dynamics × ventilation → p(E(π)) per pollutant
                                    ↓
     ┌───────────────────────────────────────────────────────────────────┐
     │ DECISION / OPTIMIZATION ENGINE                                    │
     │  Route · departure time · mode · destination · whole-day schedule │
     │  Pareto multi-objective · CVaR risk · DRO · chance constraints    │
     │  Paired confidence · value of information · counterfactuals       │
     └──────────────────────────────┬────────────────────────────────────┘
                                    ↓
              PERSONAL ASSISTANT (reactive + proactive)
              explanation: why · benefit · cost · confidence · factors
                                    ↓
              USER FEEDBACK / OBSERVATION (trajectories, choices, sensors)
                                    │
                                    └──────────→ ADAPTATION (personal model, assimilation)

     Cross-cutting: graceful degradation (L0–L7) · privacy boundary · calibration monitoring
```

---

# 52. Final One-Sentence Definition and Core Philosophy

## 52.1 One-sentence definition

> **An Urban Personal Exposure Digital Twin is a physics-constrained, uncertainty-aware spatiotemporal system that models the evolving urban pollution field, tracks a person's movement through indoor, in-vehicle and outdoor microenvironments, estimates their cumulative exposure with calibrated uncertainty, and optimizes future routes, times, modes, destinations and schedules to reduce exposure — with explained, risk-aware recommendations — under real-world constraints.**

## 52.2 Core philosophy

> **Do not build complicated AI for the sake of complicated AI. Find the real-world complexity first. Then use the mathematical architecture required to model that complexity.**

```text
Dynamic pollution               → Spatiotemporal modelling
Field-to-field PDE evolution    → Neural operator
Varying cities, same physics    → Operator transfer
Irregular street network        → Street-network GNN
Physical transport & dilution   → Physics-informed learning
Unresolved chemistry            → Learned closure
Uncertain emissions             → Emission inversion
Heterogeneous instruments       → Observation operators / assimilation
Sparse, correlated errors       → Joint generative uncertainty
Moving human                    → Trajectory modelling
Indoor/outdoor/vehicle          → Microenvironment dynamics
Breathing varies                → Ventilation model
Cumulative exposure             → Exposure integration
Competing goals                 → Multi-objective optimization
Uncertain future                → Risk-aware / robust optimization
Interacting daily trips         → Whole-day schedule optimization
Abnormal episodes               → Event detection
Recurring behaviour             → Personalization
Users need to trust advice      → Explainability with calibrated confidence
```

The resulting system is not **"AQI + AI"**. It is:

> **A decision-support digital twin connecting atmospheric dynamics to individual human mobility and exposure.**

---

# Appendix A — v1 → v2 Traceability

Every v1 section and where it now lives. Nothing was removed.

| v1 § | v1 title | v2 location |
|---|---|---|
| 1 | Executive Summary (not / are building) | §1.1, §1.2 |
| 2 | The Fundamental Problem | §2.1 |
| 3 | Pollution as a dynamical system | §3.1, §14 |
| 4 | Core Scientific Shift | §2.2 |
| 5 | Central Research Question | §4.1 |
| 6 | System Objectives | §8.1, §9 |
| 7 | System Architecture | §10.1, §51 |
| 8 | Multi-Source Data Acquisition | §11 |
| 9 | Data Fusion | §12 |
| 10 | Urban Representation as a Graph | §13.3 |
| 11 | Why GNN? | §15 |
| 12 | Physics-Constrained Dynamics (PDE) | §14 (corrected with BLH term) |
| 13 | Why Physics-Informed Learning | §16 |
| 14 | Neural Operator | §17 |
| 15 | GNN + Neural Operator + Physics | §10.3, §15–§17 |
| 16 | Candidate Pollution Model | §10.1, §17.3 |
| 17 | Uncertainty Quantification | §19 |
| 18 | Why Uncertainty Matters | §19.4, §31.5–§31.7 |
| 19 | Human Mobility Model | §20 |
| 20 | Indoor/Outdoor Microenvironment Model | §21.1 |
| 21 | Outdoor Exposure | §22.1 |
| 22 | Indoor Exposure | §21.3–§21.5 |
| 23 | Microenvironment Classification | §21.2 |
| 24 | Personal Exposure Model | §22.1 |
| 25 | Personal Exposure Field | §22.4 |
| 26 | Dynamic Exposure-Aware Routing | §23.1 |
| 27 | Route Recommendation | §23.5 |
| 28 | Time Optimization | §24 |
| 29 | Whole-Day Schedule Optimization | §25.1 |
| 30 | Schedule Optimization Formulation | §25.2, §33.5 |
| 31 | Location Choice | §25.4 |
| 32 | Activity-Aware Exposure | §22.2, §25.5 |
| 33 | The User's Week as a Learning Signal | §27.2 |
| 34 | Closed-Loop Personalization | §27.5 |
| 35 | Digital Twin Concept | §32 |
| 36 | Why the Architecture Is Justified | §10.3, Component Cards |
| 37 | What NOT to Do | Guiding Principle P1 |
| 38 | Recommended Minimum Research Architecture | §10.1, §44, §45 |
| 39 | Baselines | §35 (extended with CAMS/WRF-Chem baseline) |
| 40 | Evaluation | §37 |
| 41 | Key Demo Scenario | §7.1, §44 |
| 42 | Example Assistant Output | §7.1 |
| 43 | What Makes This Different | §5.4 |
| 44 | Research Novelty Positioning | §5 |
| 45 | Why This Is a Difficult Problem | §2.4 |
| 46 | Privacy and Data Governance | §40.1–§40.2 |
| 47 | Safety and Scientific Honesty | §40.3, Principle P4 |
| 48 | Implementation Roadmap (Phases 1–15) | §46.2 (all 15 phases retained, plus 5S, 13A, 13B, 15C, 16) |
| 49 | MVP vs Research Version | §43–§45 |
| 50 | Final Target Architecture | §51 |
| 51 | Core Product Experience | §7 |
| 52 | One-Sentence Definition | §52.1 (extended) |
| 53 | Core Philosophy | Principle P1, §52.2 (extended) |
