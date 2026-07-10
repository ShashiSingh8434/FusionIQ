"""
main.py — FusionIQ FastAPI application entry point.

Day 2 scope: /health route + DB init + CORS.
Later routes (/plant-state, /hazard-score, etc.) added Day 3 onwards.
"""

from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.models import HealthResponse


# ---------------------------------------------------------------------------
# Lifespan — runs once on startup and once on shutdown
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("[FusionIQ] Starting up -- initialising database...")
    init_db()
    print("[FusionIQ] Database ready.")
    yield
    # Shutdown (nothing to tear down for SQLite, but hook is here for later)
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
    version="0.1.0",
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# CORS — allow the Vite dev server (localhost:5173) and any other local origin
# ---------------------------------------------------------------------------


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite default
        "http://localhost:3000",   # fallback / CRA
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Routes
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
        version="0.1.0",
    )


# ---------------------------------------------------------------------------
# Placeholder stubs — filled in Day 3 onwards
# Routes are registered here now so the /docs page shows the full API surface.
# ---------------------------------------------------------------------------


@app.get("/plant-state", tags=["Simulator"], summary="Current plant sensor state (Day 3)")
async def plant_state_stub():
    return {"detail": "Not implemented yet — coming Day 3"}


@app.get("/hazard-score", tags=["Hazard Engine"], summary="Compound hazard score (Day 4)")
async def hazard_score_stub():
    return {"detail": "Not implemented yet — coming Day 4"}


@app.get("/hazard-explanation", tags=["Explainability"], summary="Gemini explanation (Day 5)")
async def hazard_explanation_stub():
    return {"detail": "Not implemented yet — coming Day 5"}


@app.get("/similar-incident", tags=["RAG"], summary="Similar past incident (Day 8)")
async def similar_incident_stub():
    return {"detail": "Not implemented yet — coming Day 8"}


@app.get("/incident-report", tags=["Reports"], summary="Formatted incident report (Day 8)")
async def incident_report_stub():
    return {"detail": "Not implemented yet — coming Day 8"}
