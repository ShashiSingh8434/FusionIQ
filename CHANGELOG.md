# FusionIQ — Changelog

> **Project:** Compound Industrial Hazard Detection Prototype
> **Event:** ET AI Hackathon 2026
> **Build target:** 10-day sprint (Days 1–10)
> **Last updated:** 2026-07-11

---

## Current Build Status — Day 4 Complete ✅

The core backend pipeline is **fully functional end-to-end**: scenario data flows from `scenario.json` → simulator → hazard engine → SQLite → REST API. All 21 unit tests pass. The frontend is a Day 2 skeleton (health-check only) — the real dashboard panels are scheduled for Days 6–7.

### What is working right now

| Layer | Status | Notes |
|---|---|---|
| FastAPI backend | ✅ Running | `uvicorn app.main:app --reload` on port 8000 |
| SQLite database | ✅ Live | Tables created + zone rows seeded on first startup |
| Scenario data | ✅ Locked | `data/scenario.json` is the single source of truth |
| Data simulator | ✅ Day 3 complete | Interpolated, noisy, looping sensor stream |
| Hazard engine | ✅ Day 4 complete | 4 signal-agents + orchestrator + compound bonus |
| Unit tests | ✅ 21/21 passing | Full coverage of all engine logic |
| React frontend | 🔶 Day 2 skeleton | Health-check UI only; full dashboard coming Day 6 |
| Gemini integration | ⏳ Day 5 | Stub route exists, not wired |
| RAG / Incident match | ⏳ Day 8 | Stub route exists |
| Incident report gen | ⏳ Day 8 | Stub route exists |

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

## Upcoming Days

| Day | Goal | Key deliverables |
|---|---|---|
| **Day 5** | Gemini integration | `explainability.py` — prompt builder, API call, JSON parse, hardcoded fallback; `/hazard-explanation` wired |
| **Day 6** | Dashboard core + heatmap | Live plant overview SVG, `HeatmapGrid.jsx` (SVG rect cells colored by score), Compound Hazard Panel with 4-agent bars, setInterval polling |
| **Day 7** | Secondary panels + knowledge graph | Permit list, worker tracker, `KnowledgeGraph.jsx` using reactflow + `/knowledge-graph` endpoint |
| **Day 8** | RAG + incident report | `incidents.json` with 10–15 entries, tag-overlap matcher, `report_generator.py`, `/similar-incident` + `/incident-report` wired |
| **Day 9** | Polish + docs | Consistent color system, architecture diagram, detailed document (~12 pages), README updated |
| **Day 10** | Record + submit | Demo video (3–4 min), rehearse 2x with fallback ready, final commit, submit |

---

## API Reference (current endpoints)

Base URL: `http://localhost:8000`

| Method | Path | Status | Description |
|---|---|---|---|
| `GET` | `/health` | Live | Liveness check — `{status, timestamp, version}` |
| `GET` | `/docs` | Live | Swagger UI — full planned API surface |
| `GET` | `/plant-state` | Live | Interpolated plant state for all 3 zones |
| `POST` | `/simulator/reset` | Live | Restart scenario clock to t=0 |
| `GET` | `/hazard-score` | Live | Compound score for all zones with per-agent breakdown |
| `GET` | `/hazard-score/{zone_id}` | Live | Score for a single zone |
| `GET` | `/knowledge-graph/{zone_id}` | Live | React Flow graph data for Day 7 panel |
| `GET` | `/hazard-explanation` | Stub | Coming Day 5 |
| `GET` | `/similar-incident` | Stub | Coming Day 8 |
| `GET` | `/incident-report` | Stub | Coming Day 8 |

---

## Running the Project

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
# API: http://localhost:8000
# Swagger: http://localhost:8000/docs
```

### Unit tests
```bash
cd backend
python -m pytest tests/test_hazard_engine.py -v
```

### Frontend (Day 2 skeleton)
```bash
cd frontend
npm install
npm run dev
# http://localhost:5173
```

### Environment variables
Create `.env` in the project root — **never commit this file**:
```
GEMINI_API_KEY=your_key_here
```

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
│   │   ├── main.py           [done] Routes: /health, /plant-state, /hazard-score, /knowledge-graph
│   │   ├── database.py       [done] SQLAlchemy ORM, init_db(), 6 tables
│   │   ├── models.py         [done] Pydantic schemas for all API responses
│   │   ├── simulator.py      [done] Day 3 — keyframe interpolation, noise, enrichment
│   │   ├── hazard_engine.py  [done] Day 4 — 4 agents + orchestrator + knowledge graph builder
│   │   ├── explainability.py [stub] Day 5
│   │   ├── rag.py            [stub] Day 8
│   │   └── report_generator.py  [pending] Day 8
│   ├── tests/
│   │   └── test_hazard_engine.py  [done] 21 unit tests, all passing
│   ├── requirements.txt      [done]
│   └── fusioniq.db           [done] Auto-created on first run
├── frontend/
│   ├── src/
│   │   ├── App.jsx           [skeleton] Day 2 health-check UI only
│   │   ├── index.css         [done] Tailwind + custom design tokens
│   │   ├── components/       [pending] HeatmapGrid.jsx, KnowledgeGraph.jsx — Day 6/7
│   │   └── pages/            [pending] Day 6+
│   ├── package.json          [done] reactflow installed
│   └── vite.config.js        [done]
├── data/
│   ├── scenario.json         [LOCKED] single source of truth
│   └── incidents.json        [pending] Day 8
├── docs/                     [pending] Architecture diagram, detailed doc — Day 9
├── .env                      [done] git-ignored (Gemini API key)
├── .gitignore                [done]
├── README.md                 [done]
└── CHANGELOG.md              [done] This file
```
