# FusionIQ

> **Compound Industrial Hazard Detection — ET AI Hackathon 2026**

[![Backend](https://img.shields.io/badge/Backend-FastAPI_0.8.0-009688?style=flat-square)](http://localhost:8000/docs)
[![Frontend](https://img.shields.io/badge/Frontend-React_+_Vite-61dafb?style=flat-square)](http://localhost:5173)
[![Build](https://img.shields.io/badge/Build-Days_1--9_complete-22c55e?style=flat-square)](#development-status)
[![AI](https://img.shields.io/badge/AI-Gemini_2.0_Flash-4285f4?style=flat-square)](#tech-stack)

---

## The Problem

Modern industrial facilities have thousands of sensors — but each system evaluates its own signal in isolation.

A gas reading at 85 ppm (threshold: 100 ppm) is *manageable on its own.*  
Add a hot-work permit (open flame), a confined-space entry (no escape route), and active maintenance (more ignition sources) — and the **combination is catastrophic** even though no single sensor has crossed its alarm threshold.

Standard SCADA systems alert on individual thresholds. FusionIQ scores the **compound state** of the plant.

> In 2020, a gas leak at a major Indian petrochemical facility killed 12 people and sent 100+ to hospital. No single sensor tripped its alarm before the incident.

---

## What FusionIQ Does

FusionIQ is a real-time compound hazard detection platform that:

1. **Reads four independent signal streams** — gas concentration, work permit status, worker locations, and maintenance activity
2. **Runs each through a dedicated signal-agent** — each agent scores its own stream independently
3. **Fuses the scores in an orchestrator** — applies a compound interaction bonus when multiple risk factors are simultaneously active
4. **Explains the hazard in plain language** — Gemini 2.0 Flash generates root cause, confidence, and recommended actions
5. **Matches against historical incidents** — tag-overlap RAG against a 15-entry incident corpus
6. **Generates a regulatory-style incident report** — 7 sections, downloadable as `.txt`
7. **Visualises everything live** — geospatial heatmap, knowledge graph, permit/worker panels

---

## Core Innovation — The Compound Hazard Formula

```python
# Each signal-agent scores its own stream (max contribution shown)
gas_score    = min(60, (gas_ppm / threshold) * 60)  # cap: gas alone can't cross "High"
permit_score = 15 if hot_work_permit else 0
worker_score = 15 if confined_space_entry else 0
maint_score  = 10 if maintenance_active else 0

base = gas_score + permit_score + worker_score + maint_score

# Compound interaction bonus fires when ≥2 risk factors are active AND gas > 75% LEL
active_factors = sum([hot_work_permit, confined_space_entry, maintenance_active])
if (gas_ppm / threshold) > 0.75 and active_factors >= 2:
    interaction_bonus = 15 * active_factors   # ← this is the compound logic
else:
    interaction_bonus = 0

score = min(100, base + interaction_bonus)
```

**Why this matters:** gas alone at 91 ppm → score ~54 (Elevated). Gas + permit + confined entry + maintenance → score 100 (Critical). The 46-point delta is the compound interaction bonus — a signal no single-sensor system can produce.

---

## Live Demo Scenario

The simulator plays a ~3-minute scenario loop from `data/scenario.json`:

| Scenario Time | Gas (ppm) | Hot-Work | Confined Space | Maintenance | Score | Level |
|---|---|---|---|---|---|---|
| 0:00 | 40 | — | — | — | ~8 | **Safe** |
| 0:50 | 82 | — | — | — | ~22 | **Safe** |
| 1:20 | 85 | ✓ | — | — | ~41 | **Elevated** |
| 1:50 | 88 | ✓ | ✓ | — | ~68 | **High** |
| 2:20 | 91 | ✓ | ✓ | ✓ | **100** | **Critical** |

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Backend framework | FastAPI (Python) | REST API, Swagger UI at `/docs` |
| Database | SQLite + SQLAlchemy | Hazard event audit log, zone/worker data |
| Data validation | Pydantic v2 | Request/response schemas |
| AI integration | Google Gemini 2.0 Flash | Natural-language hazard explanation |
| Frontend | React + Vite | Dashboard UI |
| Styling | Tailwind CSS | Design tokens, dark theme |
| Graph UI | React Flow | Live knowledge graph panel |
| Testing | pytest | 21 unit tests for the hazard engine |
| Simulation | Custom Python | `scenario.json` replay with interpolation + noise |
| RAG | Tag-overlap matching | 15-entry incident corpus, no vector DB needed |

---

## Repository Structure

```
FusionIQ/
├── backend/
│   ├── app/
│   │   ├── main.py             # FastAPI app, all 10 routes
│   │   ├── database.py         # SQLAlchemy ORM, 6 tables
│   │   ├── models.py           # Pydantic v2 schemas
│   │   ├── simulator.py        # Scenario replay + interpolation
│   │   ├── hazard_engine.py    # 4 signal-agents + orchestrator
│   │   ├── explainability.py   # Gemini API + fallback
│   │   ├── rag.py              # Tag-overlap incident matcher
│   │   └── report_generator.py # 7-section regulatory report
│   ├── tests/
│   │   └── test_hazard_engine.py  # 21 unit tests, all passing
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── App.jsx             # Full dashboard + polling + modals
│       ├── index.css           # Design system
│       └── components/
│           ├── HeatmapGrid.jsx # SVG geospatial safety heatmap
│           └── KnowledgeGraph.jsx  # React Flow knowledge graph
├── data/
│   ├── scenario.json           # LOCKED — single source of truth
│   └── incidents.json          # 15-entry RAG corpus
├── .env                        # GEMINI_API_KEY (git-ignored)
└── CHANGELOG.md                # Full day-by-day build log
```

---

## How to Run Locally

### Prerequisites

- Python 3.11+
- Node 18+
- Git

### 1 — Clone and configure

```bash
git clone <repo-url>
cd FusionIQ
```

Create `.env` in the project root (required for live Gemini explanations — the app works without it using hardcoded fallbacks):

```
GEMINI_API_KEY=your_key_here
```

### 2 — Start the backend

```powershell
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Verify at **http://localhost:8000/docs** — all 10 routes should be visible in Swagger UI.

### 3 — Start the frontend

```powershell
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** — the dashboard starts live immediately.

### 4 — Watch the scenario

The simulator starts automatically. Watch the dashboard as it progresses:

| Real time | Scenario milestone | Dashboard reaction |
|---|---|---|
| ~0s | Plant nominal | All zones green · Score ~8 |
| ~25s | Gas rising | Zone Alpha yellow · Heatmap brightens |
| ~40s | Hot-work permit issued | Permit panel shows conflict warning |
| ~55s | Confined-space entry | Knowledge graph adds Worker node |
| ~70s | All factors active | Score 100 · Critical · Gemini explanation fires |
| ~90s | Loop restart | Reset to Safe |

### 5 — Generate a report

Click **📋 Generate Report** in the right column. A 7-section regulatory-style report appears in a modal and can be downloaded as `.txt`.

### 6 — Run unit tests

```powershell
cd backend
pytest tests/ -v
```

Expected: `21 passed in ~1s`

### 7 — Reset the scenario clock

```powershell
# PowerShell
Invoke-WebRequest -Method POST http://localhost:8000/simulator/reset
# or curl
curl -X POST http://localhost:8000/simulator/reset
```

---

## API Reference

Base URL: `http://localhost:8000`

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness check |
| `GET` | `/docs` | Swagger UI |
| `GET` | `/plant-state` | Interpolated sensor state for all 3 zones |
| `POST` | `/simulator/reset` | Restart scenario clock to t=0 |
| `GET` | `/hazard-score` | Compound score for all zones + per-agent breakdown |
| `GET` | `/hazard-score/{zone_id}` | Score for one zone |
| `GET` | `/knowledge-graph/{zone_id}` | React Flow node/edge data |
| `GET` | `/hazard-explanation` | Gemini root-cause + actions (cached, fallback-safe) |
| `GET` | `/similar-incident` | Best-matching historical incident (RAG) |
| `GET` | `/incident-report` | Full 7-section regulatory report (text) |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `ModuleNotFoundError: dotenv` | `pip install python-dotenv` |
| `ModuleNotFoundError: google.generativeai` | `pip install google-generativeai` |
| Dashboard shows "Offline" | Start the backend before opening the frontend |
| Score stuck at 0 | `POST /simulator/reset` to restart the clock |
| Knowledge graph blank | Wait 3 seconds for the first poll; check browser console for React Flow errors |
| Report modal empty | Backend returned no data — check `/incident-report` in Swagger |

---

## Development Status

**Days 1–9 complete.** Day 10 = demo video + final submission.

| Day | Status | Delivered |
|---|---|---|
| Day 1 | ✅ | Scenario locked, schema agreed |
| Day 2 | ✅ | FastAPI + React skeleton, backend↔frontend handshake |
| Day 3 | ✅ | Data simulator — interpolation, noise, 3-zone stream |
| Day 4 | ✅ | Compound hazard engine — 4 agents + orchestrator + 21 tests |
| Day 5 | ✅ | Gemini explainability — timeout, fallback, per-event cache |
| Day 6 | ✅ | Dashboard — heatmap, compound panel, scenario clock |
| Day 7 | ✅ | Permit panel, worker tracking, knowledge graph (React Flow) |
| Day 8 | ✅ | RAG matcher, incident report generator, modal + download |
| Day 9 | ✅ | UI polish — animations, focus rings, React Flow theme |
| Day 10 | 🔲 | Demo video, architecture diagram, final submission |

---

> **Note on simulated data:** All sensor readings, worker locations, and incident reports in this prototype are driven by `data/scenario.json` — a scripted fictional scenario. This is a deliberate design choice documented transparently in the codebase and build log. A production deployment would connect to live SCADA feeds, a real DCS, and a validated incident database.

---

*FusionIQ · ET AI Hackathon 2026 · Industrial Decision Intelligence*