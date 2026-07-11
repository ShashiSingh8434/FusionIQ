"""
main.py — FusionIQ FastAPI application entry point.

Day 2: /health route + DB init + CORS.
Day 3: /plant-state wired to simulator.
Day 4: /hazard-score wired to hazard engine (4 agents + orchestrator).
Day 5: /hazard-explanation wired to explainability module (Gemini + fallback).
Day 6+: /hazard-explanation integrated into full dashboard.
"""

import os

from dotenv import load_dotenv

# Load .env from the project root (two levels up from app/)
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv(os.path.join(_PROJECT_ROOT, ".env"))

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.explainability import explain_hazard, get_cached_explanation
from app.hazard_engine import HazardScoreResult, build_knowledge_graph, score_all_zones, score_zone
from app.models import (
    AgentBreakdownSchema,
    HazardScoreResponse,
    HealthResponse,
    PlantStateResponse,
)
from app.simulator import get_current_plant_state, get_scenario_elapsed_seconds, reset_simulator


# ---------------------------------------------------------------------------
# Lifespan — runs once on startup and once on shutdown
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[FusionIQ] Starting up -- initialising database...")
    init_db()
    print("[FusionIQ] Database ready.")
    yield
    print("[FusionIQ] Shutting down.")


# ---------------------------------------------------------------------------
# App instance
# ---------------------------------------------------------------------------

app = FastAPI(
    title="FusionIQ API",
    description=(
        "Compound Industrial Hazard Detection Platform. "
        "Correlates gas readings, work permits, worker locations, and maintenance "
        "activity into a unified safety risk score."
    ),
    version="0.5.0",
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# CORS — allow the Vite dev server (localhost:5173) and any other local origin
# ---------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Routes — System
# ---------------------------------------------------------------------------


@app.get("/health", response_model=HealthResponse, tags=["System"])
async def health_check():
    """
    Liveness check. Frontend polls this on load to confirm the backend is up.
    Returns 200 OK with a timestamp so the UI can display connection status.
    """
    return HealthResponse(
        status="ok",
        timestamp=datetime.now(timezone.utc),
        version="0.5.0",
    )


# ---------------------------------------------------------------------------
# Routes — Simulator (Day 3)
# ---------------------------------------------------------------------------


@app.get("/plant-state", tags=["Simulator"], summary="Current plant sensor state")
async def plant_state():
    """
    Return the current interpolated state of all plant zones.

    Driven by scenario.json with real-time interpolation between keyframes
    and ±2 ppm noise on gas readings.  Refreshes on every call — poll at 2–3s
    intervals from the frontend.

    Response shape matches PlantStateResponse Pydantic model.
    """
    state = get_current_plant_state()
    return state


@app.post("/simulator/reset", tags=["Simulator"], summary="Reset scenario clock to t=0")
async def simulator_reset():
    """Reset the simulator clock so the demo plays from the beginning."""
    reset_simulator()
    return {"status": "reset", "message": "Simulator clock reset to t=0."}


# ---------------------------------------------------------------------------
# Routes — Hazard Engine (Day 4)
# ---------------------------------------------------------------------------


@app.get("/hazard-score", tags=["Hazard Engine"], summary="Compound hazard score for all zones")
async def hazard_score():
    """
    Run the 4-agent compound hazard orchestrator on the current plant state.

    Returns one score entry per zone, each containing:
    - score: 0–100 compound risk score
    - level: Safe | Elevated | High | Critical
    - signals: raw sensor values that fed into scoring
    - per_agent_breakdown: individual contribution from each of the 4 agents
    - event_id: set when a level-change event was written to the database

    The compound interaction bonus fires only when gas > 75% of threshold
    AND two or more operational risk factors are simultaneously active.
    """
    plant_state = get_current_plant_state()
    results: List[HazardScoreResult] = score_all_zones(plant_state)

    response_zones = []
    for r in results:
        response_zones.append({
            "zone_id": r.zone_id,
            "score": r.score,
            "level": r.level,
            "signals": r.signals,
            "per_agent_breakdown": {
                "gas_agent": r.per_agent_breakdown["gas_agent"],
                "permit_agent": r.per_agent_breakdown["permit_agent"],
                "worker_agent": r.per_agent_breakdown["worker_agent"],
                "maintenance_agent": r.per_agent_breakdown["maintenance_agent"],
                "interaction_bonus": r.per_agent_breakdown["interaction_bonus"],
            },
            "event_id": r.event_id,
            "timestamp": r.timestamp.isoformat(),
        })

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "simulator_elapsed_seconds": get_scenario_elapsed_seconds(),
        "zones": response_zones,
    }


@app.get(
    "/hazard-score/{zone_id}",
    tags=["Hazard Engine"],
    summary="Compound hazard score for a single zone",
)
async def hazard_score_zone(zone_id: str):
    """
    Run the compound hazard orchestrator for a specific zone only.

    Useful for polling the primary hazard zone (zone-alpha) at higher frequency
    without fetching all zones on every tick.
    """
    plant_state = get_current_plant_state()
    zone_states = {z["id"]: z for z in plant_state.get("zones", [])}

    if zone_id not in zone_states:
        raise HTTPException(status_code=404, detail=f"Zone '{zone_id}' not found.")

    r = score_zone(zone_states[zone_id])

    return {
        "zone_id": r.zone_id,
        "score": r.score,
        "level": r.level,
        "signals": r.signals,
        "per_agent_breakdown": r.per_agent_breakdown,
        "event_id": r.event_id,
        "timestamp": r.timestamp.isoformat(),
    }


@app.get(
    "/knowledge-graph/{zone_id}",
    tags=["Hazard Engine"],
    summary="React Flow knowledge graph data for a zone",
)
async def knowledge_graph(zone_id: str):
    """
    Return a React Flow-compatible node/edge graph for the given zone's
    current hazard state.  Used by the Day-7 KnowledgeGraph.jsx panel.
    """
    plant_state = get_current_plant_state()
    zone_states = {z["id"]: z for z in plant_state.get("zones", [])}

    if zone_id not in zone_states:
        raise HTTPException(status_code=404, detail=f"Zone '{zone_id}' not found.")

    zone_state = zone_states[zone_id]
    hazard_result = score_zone(zone_state)
    graph = build_knowledge_graph(zone_state, hazard_result)

    return {
        "zone_id": zone_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **graph,
    }


# ---------------------------------------------------------------------------
# Routes — Stubs for Day 5 and Day 8
# ---------------------------------------------------------------------------


@app.get("/hazard-explanation", tags=["Explainability"], summary="Gemini explanation for latest hazard")
async def hazard_explanation():
    """
    Return a natural-language explanation for the current hazard state.

    Behaviour:
    - Calls the Gemini API (gemini-2.0-flash) to generate root cause + actions.
    - Returns a cached explanation if the hazard level hasn't changed since the
      last call (avoids hammering the API on every 2-second frontend poll).
    - Falls back to a hardcoded static explanation if the API is unavailable or
      times out — the demo never breaks.
    """
    # Get current plant state and score for zone-alpha (the primary zone)
    plant_state = get_current_plant_state()
    zone_states = {z["id"]: z for z in plant_state.get("zones", [])}

    primary_zone = zone_states.get("zone-alpha")
    if not primary_zone:
        return {"detail": "Primary zone not found."}

    from app.hazard_engine import score_zone as _score_zone
    result = _score_zone(primary_zone)

    # Use event_id as cache key if a new level-change event was written;
    # otherwise use the last event_id stored in the cache.
    cache_key = result.event_id  # None if level didn't change

    # Check if we already have a cached explanation
    cached = get_cached_explanation(cache_key)
    if cached and cache_key is not None:
        return cached

    # Generate (or return "latest" cache)
    explanation = explain_hazard(
        signals=result.signals,
        score=result.score,
        level=result.level,
        event_id=result.event_id,
    )
    return explanation


@app.get("/similar-incident", tags=["RAG"], summary="Similar past incident (Day 8)")
async def similar_incident_stub():
    return {"detail": "Not implemented yet — coming Day 8"}


@app.get("/incident-report", tags=["Reports"], summary="Formatted incident report (Day 8)")
async def incident_report_stub():
    return {"detail": "Not implemented yet — coming Day 8"}
