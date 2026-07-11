# FusionIQ — Changelog

> **Project:** Compound Industrial Hazard Detection Prototype
> **Event:** ET AI Hackathon 2026
> **Build target:** 10-day sprint (Days 1–10)
> **Last updated:** 2026-07-11

---

## Current Build Status — Day 7 Complete ✅

The full pipeline is live end-to-end: scenario → simulator → hazard engine → Gemini explanation → React dashboard (heatmap + knowledge graph + all panels). Serving on `localhost:5173`.

### What is working right now

| Layer | Status | Notes |
|---|---|---|
| FastAPI backend | ✅ Running | `uvicorn app.main:app --reload` on port 8000, v0.8.0 |
| SQLite database | ✅ Live | Tables created + zone rows seeded on first startup |
| Scenario data | ✅ Locked | `data/scenario.json` is the single source of truth |
| Data simulator | ✅ Day 3 complete | Interpolated, noisy, looping sensor stream |
| Hazard engine | ✅ Day 4 complete | 4 signal-agents + orchestrator + compound bonus |
| Unit tests | ✅ 21/21 passing | Full coverage of all engine logic |
| Gemini explainability | ✅ Day 5 complete | Live Gemini + hardcoded fallback, cached per event |
| Geospatial Heatmap | ✅ Day 6 complete | SVG 6×4 grid, live score-driven colors |
| Compound Hazard Panel | ✅ Day 6 complete | 4-agent bars, interaction bonus, level badge |
| Permit list panel | ✅ Day 7 complete | Conflict detection: hot-work vs. gas >75% LEL |
| Worker tracking panel | ✅ Day 7 complete | Name, role, zone, CS/maintenance badges |
| Knowledge graph | ✅ Day 7 complete | React Flow, 6 node types, 3s live polling |
| RAG incident matcher | ✅ Day 8 complete | Tag-overlap + severity tie-break, 15-incident corpus |
| Similar Incident card | ✅ Day 8 complete | Live panel in left column, polls `/similar-incident` every 6 s |
| Incident report generator | ✅ Day 8 complete | 7-section regulatory report, modal viewer + .txt download |
| UI polish | ✅ Day 9 complete | Line-clamp, modal animation, focus rings, React Flow CSS |
| Video + submission | 🔲 Day 10 | Record, document, submit |

---

## How It Works

### The Core Idea — Compound Hazard Detection

FusionIQ's central insight is that **industrial accidents rarely have a single cause**. A gas reading at 85% of threshold is manageable on its own. Add a hot-work permit (open flame risk), a worker inside a confined space (no escape route), and an active maintenance team (more ignition sources) — and the *combination* is catastrophic even though no single sensor has crossed its alarm threshold.

Standard SCADA systems alert on individual thresholds. FusionIQ scores the **compound state** of the plant.

---

### System Architecture (current build)

```
scenario.json  -->  simulator.py  -->  /plant-state API
                                            |
                                            v
                                    hazard_engine.py
                                    +-------------------------------+
                                    |  gas_agent()      -> 0-60 pts |
                                    |  permit_agent()   -> 0-15 pts |
                                    |  worker_agent()   -> 0-15 pts |
                                    |  maintenance_agent() -> 0-10  |
                                    |         +                     |
                                    |  interaction_bonus (compound) |
                                    +-------------------------------+
                                            |
                                            v
                                    /hazard-score API --> SQLite (HazardEvent)
                                            |
                                            v
                                    /knowledge-graph API  (Day 7 UI)

React Frontend (Day 2 skeleton — polls /health only)
```

---

### Data Flow — Step by Step

1. **`scenario.json`** defines 6 keyframes across a 160-second demo arc (Zone Alpha escalates Safe → Critical; background zones stay Safe the whole time).

2. **`simulator.py`** replays the scenario in real time (1 real second = 2 scenario seconds). Between keyframes it linearly interpolates gas PPM and adds ±2 ppm random noise. Boolean flags (permits, confined space, maintenance) step-change at each keyframe boundary. The scenario loops automatically so the demo can be repeated.

3. **`/plant-state`** returns the current interpolated state of all 3 zones, enriched with worker names, roles, permit metadata, and which workers are inside confined spaces or maintenance teams.

4. **`hazard_engine.py`** receives the zone state and runs 4 independent signal-agents:
   - `gas_agent` — scores gas as `(ppm / threshold) x 60`, capped at 60. Gas alone can never reach "High."
   - `permit_agent` — adds 15 points if a hot-work permit is active.
   - `worker_agent` — adds 15 points if a worker is in confined space.
   - `maintenance_agent` — adds 10 points if maintenance is active.

   The **orchestrator** sums these scores, then applies a **compound interaction bonus**: `15 x active_risk_factors` if gas > 75% of threshold AND 2 or more risk factors are simultaneously active. This non-linear term is the key innovation — it encodes the domain knowledge that co-occurrence of risks is far more dangerous than their arithmetic sum.

5. **`/hazard-score`** returns the score, level, raw signals, and the per-agent breakdown for all zones. A new `HazardEvent` row is written to SQLite only when the hazard **level changes** (Safe → Elevated → High → Critical) — not on every poll.

6. **`/knowledge-graph/{zone_id}`** returns React Flow-compatible node/edge data describing which factors are contributing to the current hazard, ready for the Day 7 UI panel.

---

### Scoring Logic

```
score = gas_agent + permit_agent + worker_agent + maintenance_agent + interaction_bonus

where:
  gas_agent          = min(60, (gas_ppm / gas_threshold) x 60)
  permit_agent       = 15 if hot_work_permit else 0
  worker_agent       = 15 if confined_space_entry else 0
  maintenance_agent  = 10 if maintenance_active else 0
  interaction_bonus  = 15 x active_risk_factors
                       if (gas_ppm / gas_threshold > 0.75) AND (active_risk_factors >= 2)
                       else 0

level:
  score >= 80  --> Critical
  score >= 60  --> High
  score >= 35  --> Elevated
  else         --> Safe
```

#### Demo scenario scores (Zone Alpha)

| Scenario time | Gas (ppm) | Hot-work | Confined space | Maintenance | Score | Level |
|---|---|---|---|---|---|---|
| 0:00 | 40 | No | No | No | 24 | Safe |
| 0:50 | 82 | No | No | No | ~49 | Elevated |
| 1:20 | 85 | Yes | No | No | ~66 | High |
| 1:50 | 88 | Yes | Yes | No | ~100 | Critical |
| 2:20 | 91 | Yes | Yes | Yes | 100 | Critical |

*Background zones (Beta, Gamma) stay Safe throughout — gas below 30 ppm, no risk factors active.*

> **Key proof:** Gas alone at 91 ppm → Elevated (~54 pts). Gas + all 3 risk factors → Critical (100 pts).
> The compound interaction bonus adds 45 points (15 x 3 active factors) on top of the base scores.

---

## Changelog by Day

---

### Day 1 — Scenario & Schema Lock ✅

**Date completed:** Before coding began

- Wrote `data/scenario.json` — single source of truth for all simulator values, keyframe timestamps, expected scores, and worker/permit metadata
- Agreed SQLite schema (6 tables: zones, gas_readings, permits, workers, maintenance, hazard_events)
- Pushed project skeleton with folder structure and `.gitignore`

**Files added/modified:**
- `data/scenario.json` — locked scenario with 6 keyframes, 3 zones, 7 workers, 1 permit
- `data/incidents.json` — placeholder (to be filled Day 8)
- `.gitignore` — excludes `node_modules/`, `.env`, `__pycache__/`, `*.db`
- `README.md` — project overview

---

### Day 2 — Stack Skeleton ✅

**Date completed:** Before Day 3

**Backend:**
- `backend/app/main.py` — FastAPI app with `lifespan` startup hook, CORS middleware (allows localhost:5173 and localhost:3000), `/health` route returning `{status, timestamp, version}`
- `backend/app/database.py` — SQLAlchemy engine + session factory + 6 ORM models (Zone, GasReading, Permit, Worker, Maintenance, HazardEvent) + `init_db()` + `_seed_zones()` idempotent seeder
- `backend/app/models.py` — Pydantic v2 schemas for all API responses
- `backend/requirements.txt` — fastapi, uvicorn[standard], sqlalchemy, python-dotenv, google-generativeai, pydantic>=2.0
- Stub routes registered for all Day 3–8 endpoints so Swagger UI shows the full planned API surface

**Frontend:**
- Vite + React scaffold with Tailwind CSS
- `reactflow` installed (needed for Day 7 knowledge graph panel)
- `App.jsx` — health-check UI: polls `/health` every 5s, shows connection status pill, Day 2 checklist, build pipeline strip

**End-of-Day-2 checkpoint:** Frontend renders live data from backend. ✅

---

### Day 3 — Data Simulator ✅

**Date completed:** 2026-07-11

**Files modified:**
- `backend/app/simulator.py` — fully implemented (was a 65-byte stub)
- `backend/app/main.py` — `/plant-state` stub replaced; `POST /simulator/reset` added

**What was built:**

`simulator.py` loads `scenario.json` at module import and exposes `get_current_plant_state()`. Internally it:

1. Computes scenario-time elapsed using `time.monotonic()` at 2x real-time speed, wrapping at 160 scenario-seconds so the demo loops automatically
2. Finds the two surrounding keyframes
3. Linearly interpolates gas PPM between keyframes using `_lerp()`
4. Adds `random.uniform(-2.0, 2.0)` ppm noise to every gas reading — makes values look like a real sensor rather than a step function
5. Step-changes boolean flags (hot_work_permit, confined_space_entry, maintenance_active) at the keyframe boundary — they do not interpolate
6. Enriches each worker ID with name and role from scenario.json, and flags `in_confined_space` and `in_maintenance`
7. Attaches full permit metadata to zones where a permit is active

Background zones (Beta: ~12–15 ppm, Gamma: ~25–30 ppm, no risk factors) stay Safe throughout, making zone-alpha's escalation meaningful by contrast.

**New API routes:**

| Method | Path | Description |
|---|---|---|
| `GET` | `/plant-state` | Returns full interpolated state of all 3 zones |
| `POST` | `/simulator/reset` | Restarts scenario clock to t=0 |

**End-of-Day-3 checkpoint:** hitting `/plant-state` repeatedly shows values moving over time. ✅

---

### Day 4 — Compound Hazard Engine ✅

**Date completed:** 2026-07-11

**Files modified:**
- `backend/app/hazard_engine.py` — fully implemented (was a 35-byte stub)
- `backend/app/main.py` — `/hazard-score` stub replaced; `/hazard-score/{zone_id}` and `/knowledge-graph/{zone_id}` added
- `backend/tests/test_hazard_engine.py` — new file, 21 unit tests

**What was built:**

`hazard_engine.py` implements the 4-agent + orchestrator architecture:

**Signal-agents** (each is a pure function, independently testable):
- `gas_agent(gas_ppm, gas_threshold)` → 0–60 pts (capped: gas alone cannot reach "High")
- `permit_agent(hot_work_permit)` → 0 or 15 pts
- `worker_agent(confined_space_entry)` → 0 or 15 pts
- `maintenance_agent(maintenance_active)` → 0 or 10 pts

**Orchestrator** (`compound_hazard_orchestrator`):
- Sums all 4 agent scores into `base`
- Applies `interaction_bonus = 15 x active_risk_factors` when gas > 75% threshold AND >=2 risk factors are active
- Clamps to [0, 100], assigns level
- Returns `(score, level, breakdown_dict)`

**`score_zone(zone_state)`** convenience wrapper:
- Calls the orchestrator with the zone dict from the simulator
- Writes a `HazardEvent` row to SQLite only on level change using a module-level `_last_level_cache` dict
- Returns a `HazardScoreResult` dataclass

**`build_knowledge_graph(zone_state, hazard_result)`**:
- Builds React Flow-compatible `{nodes, edges}` dicts from the current zone state
- Adds animated edges when level is High or Critical
- Includes an interaction bonus edge when the compound term fires
- No Neo4j needed — pure Python dict, rendered by Day 7 frontend

**New API routes:**

| Method | Path | Description |
|---|---|---|
| `GET` | `/hazard-score` | Compound score for all zones with per-agent breakdown |
| `GET` | `/hazard-score/{zone_id}` | Score for a single zone |
| `GET` | `/knowledge-graph/{zone_id}` | React Flow node/edge data for Day 7 panel |

**Unit test results:**

```
21 passed in 0.85s

TestGasAgent                         5/5  pass
TestPermitAgent                      2/2  pass
TestWorkerAgent                      2/2  pass
TestMaintenanceAgent                 2/2  pass
TestOrchestratorScenarioKeyframes    6/6  pass  (all scenario.json keyframe rows verified)
TestOrchestratorEdgeCases            4/4  pass  (interaction bonus conditions, clamping, background zones)
```

Critical proof test passing:
- gas alone at 91 ppm → Elevated (~54 pts)
- gas + all 3 risk factors → Critical (100 pts)
- delta >= 40 pts — the compound term is doing real work

**End-of-Day-4 checkpoint:** `/hazard-score` shows score flipping Safe → Elevated → High → Critical with per-agent breakdown visible. ✅

---

### Day 5 — Gemini Explainability ✅

**Date completed:** 2026-07-11

**Files modified:**
- `backend/app/explainability.py` — fully implemented (was a 2-line stub)
- `backend/app/main.py` — `/hazard-explanation` stub replaced with real implementation

**What was built:**

`explainability.py` exposes `explain_hazard(signals, score, level, event_id)` which:

1. Builds a structured prompt describing the current hazard state — gas PPM, threshold %, permit status, confined-space status, maintenance status, compound score, and level
2. Calls `google-generativeai` SDK (`genai.GenerativeModel("gemini-2.0-flash")`) with an 8-second timeout enforced via a daemon thread + `threading.Event`
3. Strips markdown fences (`\`\`\`json … \`\`\``) defensively before `json.loads()`
4. Caches the result per `event_id` in a module-level `_explanation_cache` dict — the frontend polls every 4 seconds but the API is only called once per level-change event
5. Falls back to a hardcoded static explanation per level (Safe / Elevated / High / Critical) if the API call fails, times out, or the key is missing — the demo never breaks

**New API routes:**

| Method | Path | Description |
|---|---|---|
| `GET` | `/hazard-explanation` | Gemini root-cause + confidence + actions for zone-alpha's current hazard state |

**End-of-Day-5 checkpoint:** when score hits Critical, the explanation endpoint returns a clean root-cause + actions response — live from Gemini or indistinguishable fallback. ✅

---

### Day 6 — Dashboard Core Panels + Geospatial Heatmap ✅

**Date completed:** 2026-07-11

**Files modified:**
- `frontend/src/App.jsx` — rebuilt from skeleton into full dashboard
- `frontend/src/components/HeatmapGrid.jsx` — new file
- `frontend/src/index.css` — full design-system token set added

**What was built:**

**`HeatmapGrid.jsx`** — Geospatial Safety Heatmap (directly addresses brief bullet):
- Pure SVG, 6×4 grid overlaid on plant layout
- Each zone cell's `fill` and `opacity` computed from `score / 100` — no GIS library needed
- Color scale: `#22c55e` (safe) → `#eab308` (elevated) → `#f97316` (high) → `#ef4444` (critical)
- Animated glow ring on Critical cells via CSS keyframes
- Zone label, score number, and level text rendered inside each rect
- Props: `zones` array with `{ id, name, score, level, x, y }`

**`App.jsx`** full dashboard:
- `usePoll(url, intervalMs)` custom hook — `useEffect` + `setInterval` + cleanup; sets `loading`, `data`, `error`
- Polls `/plant-state` every 2s, `/hazard-score` every 2s, `/hazard-explanation` every 4s
- Compound Hazard Panel: large score number with level-colour glow, `LevelBadge`, 4 `AgentBar` components (gas/permit/worker/maintenance, each with max-score label), interaction bonus row
- Scenario clock bar: maps elapsed seconds to scenario milestone labels (`0:00 — Plant nominal` through `2:20 — ALL FACTORS ACTIVE`)
- Sticky header with live connection pill and current hazard level ticker (pulsing when non-Safe)

**Design tokens** in `index.css`:
- CSS variables via Tailwind `extend`: `safe`, `elevated`, `high`, `critical`, `surface`, `surface-card`, `surface-border`, `surface-muted`
- `badge-*` component classes, `agent-bar-track/fill`, `ring-critical`, `ring-high` glow animation

**End-of-Day-6 checkpoint:** dashboard visibly reacts in real time — heatmap zones change colour, compound score animates, agent bars fill as the scenario plays. ✅

---

### Day 7 — Secondary Panels + Knowledge Graph ✅

**Date completed:** 2026-07-11

**Files modified:**
- `frontend/src/App.jsx` — Permit panel, Worker panel, and Similar Incident stub added
- `frontend/src/components/KnowledgeGraph.jsx` — new file (React Flow)
- `frontend/vite.config.js` — `resolve.dedupe: ['react', 'react-dom']` added

**What was built:**

**Permit list panel:**
- Lists all active permits across all zones with type, status, and issued timestamp
- Conflict detection: if a hot-work permit is active in a zone where gas > 75% of LEL threshold, the permit row is highlighted in orange/red with a "⚠ GAS CONFLICT" badge
- Styled with `card` class, sorted by conflict status first

**Worker tracking panel:**
- Iterates all workers across all zones from `/plant-state`
- Shows avatar initial, name, role, zone ID, and hazard level with zone-colour indicator
- `CS` badge (orange) for workers with `in_confined_space: true`; `MNT` badge (purple) for `in_maintenance: true`
- Live 1-second timer tick via `setInterval` in a `useEffect`

**`KnowledgeGraph.jsx`** — Knowledge Graph (directly addresses brief bullet):
- Imports React Flow with **static module-scope `NODE_TYPES` and `EDGE_TYPES`** objects — mandatory to avoid React Flow error #002 (new object reference on every render triggers infinite re-render loop)
- 6 custom node types: `ZoneNode`, `SensorNode`, `PermitNode`, `WorkerNode`, `MaintNode`, `RiskNode`
- `LabeledEdge` custom edge type with `EdgeLabelRenderer` for relationship labels
- Polls `/knowledge-graph/zone-alpha` every 3 seconds; falls back to a hardcoded default graph while loading
- `MiniMap` coloured by node type; `Controls` styled to match dark theme

**React Flow deduplication fix:**
`vite.config.js` `resolve.dedupe: ['react', 'react-dom', 'reactflow']` ensures React Flow shares the same React instance as the app — resolves the duplicate-React hook error that appears when `reactflow` bundles its own React copy.

**End-of-Day-7 checkpoint:** all dashboard panels present including the live knowledge graph. Permits show conflict highlighting; workers show confined-space/maintenance badges. ✅

---

### Day 8 — RAG Incident Matcher + Incident Report Generator ✅

**Date completed:** 2026-07-11

**Files created:**
- `data/incidents.json` — 15 incident entries
- `backend/app/rag.py` — tag-overlap RAG matcher
- `backend/app/report_generator.py` — 7-section report formatter

**Files modified:**
- `backend/app/main.py` — `/similar-incident` and `/incident-report` stubs replaced; version bumped to `0.8.0`
- `frontend/src/App.jsx` — `IncidentPanel`, `ReportModal`, report button, `/similar-incident` poll

**What was built:**

**`incidents.json`** — 15-entry incident corpus:
- 3 entries based loosely on real public cases (DGFASLI blast furnace gas incident, OISD petrochemical tank farm, SAIL steel plant event) — details and locations anonymised, `"simulated": false`
- 12 fictional entries covering all relevant compound hazard patterns — `"simulated": true`
- Every entry has: `id`, `title`, `date`, `location`, `summary`, `tags`, `severity`, `root_cause`, `outcome`, `source_note`
- Tag vocabulary: `gas`, `hot_work`, `confined_space`, `maintenance` — matches the 4 signal-agents exactly

**`rag.py`** — tag-overlap RAG:
- `signals_to_tags(signals)` derives active tags: `gas` if `gas_ppm/gas_threshold > 0.5`, boolean flags for the others
- `find_similar_incident(signals)` scores each incident by `|active_tags ∩ incident_tags|`, breaks ties by severity order (`Critical > High > Elevated > Safe`) then by most-recent date
- Returns `None` if the best overlap score is 0 — prevents spurious matches during Safe phase
- Returns a clean result dict including `matching_tags`, `overlap_score`, and `similarity_pct`
- Corpus loaded once at module import (`_CORPUS_LOADED` flag) — no repeated file I/O

**`report_generator.py`** — 7-section regulatory report:

| Section | Content |
|---|---|
| 1. Incident Summary | Report ID (timestamped), zone, hazard level, compound score |
| 2. Detected Signals | Gas ppm + % LEL, each boolean flag status, per-agent score breakdown |
| 3. AI Root Cause Analysis | Gemini root-cause text, confidence, recommended actions |
| 4. Immediate Actions | Level-keyed action list (Critical = 8 actions; High = 6; Elevated = 5) |
| 5. Similar Historical Incident | Best RAG match — title, date, summary, root cause, outcome, source note |
| 6. Recommended Follow-up | Level-keyed follow-up list (investigation, audit, briefing timelines) |
| 7. Compliance Reference | Generic OISD 116/105/117, Factories Act s.36/36A, DGMS, PNGRB — no fabricated clause numbers |

**Frontend additions:**
- `IncidentPanel` component: active signal tag pills, similarity %, matched-tag checkmarks, summary (3-line clamp), historical root-cause card, source note
- `ReportModal`: fixed overlay, monospaced `<pre>` report body, level-accented border, `↓ Download .txt` button creates Blob URL for client-side download, click-backdrop-to-close
- Generate Report button in right column: level-coloured, spinner state during fetch, `async/await` with error handling
- `/similar-incident` added to polling hooks at 6-second interval

**New API routes:**

| Method | Path | Description |
|---|---|---|
| `GET` | `/similar-incident` | Tag-overlap RAG match — `{ timestamp, zone_id, active_tags, match }` |
| `GET` | `/incident-report` | Full 7-section report text — `{ timestamp, zone_id, level, score, report }` |

**Smoke-test results:**
- During `gas + hot_work + confined_space` phase: `/similar-incident` → INC-003, 100% tag match ✅
- `/incident-report` → 130–145 lines, all 7 sections present, level reflects current scenario phase ✅

**End-of-Day-8 checkpoint:** full pipeline runs clean front-to-back — simulator → engine → explanation → heatmap → knowledge graph → RAG match → incident report — without manual intervention. Generate Report button produces a downloadable regulatory-style report. ✅

---

### Day 9 — UI Polish ✅

**Date completed:** 2026-07-11

**Files modified:**
- `frontend/src/index.css` — Day 9 polish block appended
- `frontend/src/App.jsx` — `modal-enter` class applied to modal inner div; footer version label updated

**What was polished:**

| Item | Change |
|---|---|
| Line-clamp utilities | Added `.line-clamp-2/3/4` — used in `IncidentPanel` summary to prevent overflow |
| Modal animation | `@keyframes modalIn` (scale 0.96→1, translateY 8px→0, 0.22s) + `.modal-enter` class applied to `ReportModal` |
| Focus ring | `:focus-visible` — indigo 2px outline, `outline-offset: 2px`, borderRadius 4px — accessible but styled |
| Smooth scroll | `html { scroll-behavior: smooth; }` |
| React Flow controls | `.react-flow__controls-button` — dark background `#161b27`, styled border/text to match theme |
| React Flow minimap | `border-radius: 8px; overflow: hidden` — consistent with card rounding |
| Edge width | Corrected from `2px` to `1.5px` — matches the node border weights visually |
| Tag pill hover | `.tag-pill { transition: filter 0.15s; } :hover { brightness(1.25) }` — subtle interactivity hint |
| Scrollbar (modal) | `.report-pre` scrollbar — 4px wide, matches global scrollbar style |

**End-of-Day-9 checkpoint:** dashboard is visually consistent — card rounding, spacing, focus states, and animations are coherent across all panels. Knowledge graph controls match the dark theme. Report modal animates in smoothly. ✅

---

## Day Log

| Day | Status | What was delivered |
|---|---|---|
| **Day 1** | ✅ Done | `scenario.json` locked; SQLite schema agreed; repo skeleton pushed |
| **Day 2** | ✅ Done | FastAPI `/health` + CORS; React+Vite skeleton; frontend ↔ backend handshake confirmed |
| **Day 3** | ✅ Done | `simulator.py` — keyframe interpolation, ±2 ppm noise, 3-zone background, `/plant-state` live |
| **Day 4** | ✅ Done | `hazard_engine.py` — 4 signal-agents + orchestrator + compound bonus; 21/21 unit tests pass; `/hazard-score` live |
| **Day 5** | ✅ Done | `explainability.py` — Gemini `gemini-2.0-flash`, 8 s timeout, fallback per level, event-id cache; `/hazard-explanation` live |
| **Day 6** | ✅ Done | Full dashboard: `HeatmapGrid.jsx` (SVG 6×4, score-driven colors), Compound Hazard Panel, 4-agent bars, interaction bonus row, scenario clock |
| **Day 7** | ✅ Done | Permit conflict panel, Worker tracking panel, `KnowledgeGraph.jsx` (React Flow, 6 node types, module-scope nodeTypes fix) |
| **Day 8** | ✅ Done | 15-entry `incidents.json`; `rag.py` (tag-overlap + severity tie-break); `report_generator.py` (7-section report); `/similar-incident` + `/incident-report` live; Similar Incident card + Report modal + .txt download in dashboard |
| **Day 9** | ✅ Done | CSS polish: line-clamp, modal-enter animation, focus rings, React Flow control overrides; footer/version bumped to Day 8 build |
| **Day 10** | 🔲 Next | Demo video (3–4 min), rehearse 2×, architecture diagram, detailed document, final commit, submit |

---

## API Reference (current endpoints)

Base URL: `http://localhost:8000`

| Method | Path | Status | Description |
|---|---|---|---|
| `GET` | `/health` | ✅ Live | Liveness check — `{status, timestamp, version}` |
| `GET` | `/docs` | ✅ Live | Swagger UI — full API surface |
| `GET` | `/plant-state` | ✅ Live | Interpolated plant state for all 3 zones |
| `POST` | `/simulator/reset` | ✅ Live | Restart scenario clock to t=0 |
| `GET` | `/hazard-score` | ✅ Live | Compound score for all zones + per-agent breakdown |
| `GET` | `/hazard-score/{zone_id}` | ✅ Live | Score for a single zone |
| `GET` | `/knowledge-graph/{zone_id}` | ✅ Live | React Flow node/edge data — Zone → Permit → Risk |
| `GET` | `/hazard-explanation` | ✅ Live | Gemini root-cause + actions (cached per event, fallback-safe) |
| `GET` | `/similar-incident` | ✅ Live | RAG tag-overlap match from `incidents.json` (15 entries) |
| `GET` | `/incident-report` | ✅ Live | 7-section regulatory report (text), aggregates all pipeline data |

---

## How to Run Locally

> **Prerequisites:** Python 3.11+, Node 18+. Run commands from the project root unless noted.

### 1 · Set your Gemini API key

Create `.env` in the project root (already git-ignored). The backend reads it on startup:
```
GEMINI_API_KEY=your_key_here
```
> If the key is missing, the backend still runs — the `/hazard-explanation` endpoint falls back to the hardcoded responses automatically.

---

### 2 · Start the backend

Open **Terminal 1**:
```bash
cd backend
pip install -r requirements.txt    # first time only
uvicorn app.main:app --reload
```

Confirm it’s up:

| URL | Expected response |
|---|---|
| http://localhost:8000/health | `{"status":"ok", "version":"0.5.0"}` |
| http://localhost:8000/docs | Swagger UI with all routes |
| http://localhost:8000/plant-state | Live sensor JSON (values change each call) |
| http://localhost:8000/hazard-score | Compound score + per-agent breakdown |
| http://localhost:8000/hazard-explanation | Gemini explanation or hardcoded fallback |

---

### 3 · Start the frontend dashboard

Open **Terminal 2**:
```bash
cd frontend
npm install     # first time only
npm run dev
```

Open **http://localhost:5173** in a browser. The dashboard polls the backend every 2 seconds.

What to expect as the scenario runs:

| Scenario time | What you see |
|---|---|
| 0:00 | All zones green — “Safe”, score ~24 |
| 0:50 | Zone Alpha turns yellow — “Elevated”, gas rising |
| 1:20 | Orange — “High”, hot-work permit issued, permit conflict flagged |
| 1:50 | Red — “Critical”, confined-space entry, interaction bonus fires |
| 2:20 | Score 100, all 3 risk factors active, explanation panel populates |
| ~3:00 | Scenario loops back to Safe automatically |

---

### 4 · Run unit tests

```bash
cd backend
python -m pytest tests/test_hazard_engine.py -v
# Expected: 21 passed in < 1 s
```

---

### 5 · Reset the scenario manually

```powershell
# PowerShell
Invoke-WebRequest -Uri "http://localhost:8000/simulator/reset" -Method POST
```
```bash
# bash / curl
curl -X POST http://localhost:8000/simulator/reset
```

The frontend reflects t=0 on the next poll.

---

### Troubleshooting

| Problem | Fix |
|---|---|
| `ModuleNotFoundError: dotenv` | `pip install python-dotenv` |
| `ModuleNotFoundError: google.generativeai` | `pip install google-generativeai` |
| Dashboard shows “Offline” | Start the backend before opening the frontend |
| Score stuck at 0 | `POST /simulator/reset` to restart the clock |
| Knowledge graph blank | Scroll down — it’s below the permit/worker panels |

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Backend framework | FastAPI (Python) | REST API, auto Swagger docs |
| Database | SQLite + SQLAlchemy | Hazard event audit log, zone/worker data |
| Data validation | Pydantic v2 | Request/response schemas |
| AI integration | Google Gemini API | Natural-language hazard explanation (Day 5) |
| Frontend | React + Vite | Dashboard UI |
| Styling | Tailwind CSS | Design system |
| Graph UI | React Flow | Knowledge graph panel (Day 7) |
| Testing | pytest | Unit tests for hazard engine |
| Simulation | Custom Python | scenario.json replay with interpolation + noise |

---

## File Map

```
FusionIQ/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py           [done] v0.8.0 — all 10 routes live incl. /similar-incident + /incident-report
│   │   ├── database.py       [done] SQLAlchemy ORM, init_db(), 6 tables
│   │   ├── models.py         [done] Pydantic v2 schemas for all API responses
│   │   ├── simulator.py      [done] Day 3 — keyframe interpolation, ±2 ppm noise, 3-zone stream
│   │   ├── hazard_engine.py  [done] Day 4 — 4 agents + orchestrator + compound bonus + KG builder
│   │   ├── explainability.py [done] Day 5 — Gemini API, 8 s timeout, fallback, per-event cache
│   │   ├── rag.py            [done] Day 8 — tag-overlap scorer, severity tie-break, zero-overlap guard
│   │   └── report_generator.py  [done] Day 8 — 7-section regulatory report, compliance refs, immediate actions
│   ├── tests/
│   │   └── test_hazard_engine.py  [done] 21 unit tests, all passing
│   ├── requirements.txt      [done]
│   └── fusioniq.db           [done] Auto-created on first run
├── frontend/
│   ├── src/
│   │   ├── App.jsx           [done] Day 8 — IncidentPanel + ReportModal + report button + /similar-incident poll
│   │   ├── index.css         [done] Day 9 — line-clamp, modal-enter animation, focus ring, React Flow overrides
│   │   └── components/
│   │       ├── HeatmapGrid.jsx    [done] Day 6 — SVG 6×4 geospatial heatmap
│   │       └── KnowledgeGraph.jsx [done] Day 7 — React Flow, 6 node types, module-scope nodeTypes (error#002 fixed)
│   ├── package.json          [done] reactflow v11 installed
│   ├── tailwind.config.js    [done] custom color tokens + glow keyframes
│   └── vite.config.js        [done] resolve.dedupe for reactflow
├── data/
│   ├── scenario.json         [LOCKED] single source of truth — never edit
│   └── incidents.json        [done] Day 8 — 15 entries (3 real-based, 12 fictional), all 4 tags covered
├── docs/                     [pending] Architecture diagram, detailed doc — Day 10
├── .env                      [done] git-ignored — put GEMINI_API_KEY here
├── .gitignore                [done]
├── README.md                 [done]
└── CHANGELOG.md              [done] This file
```
