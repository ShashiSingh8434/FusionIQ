"""
models.py — Pydantic response/request schemas for the FusionIQ API.

Kept separate from database.py (SQLAlchemy ORM) to maintain a clean boundary
between persistence and transport layers.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


class HealthResponse(BaseModel):
    status: str = "ok"
    timestamp: datetime
    version: str = "0.1.0"


# ---------------------------------------------------------------------------
# Zone
# ---------------------------------------------------------------------------


class ZoneSchema(BaseModel):
    id: str
    name: str
    x: float
    y: float
    hazard_class: str

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Gas readings
# ---------------------------------------------------------------------------


class GasReadingSchema(BaseModel):
    zone_id: str
    ppm: float
    threshold: float
    ts: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Permits
# ---------------------------------------------------------------------------


class PermitSchema(BaseModel):
    id: int
    permit_ref: Optional[str] = None
    zone_id: str
    type: str
    status: str
    issued_ts: datetime
    conflicts_with: Optional[str] = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Workers
# ---------------------------------------------------------------------------


class WorkerSchema(BaseModel):
    id: int
    worker_id: str
    name: str
    zone_id: str
    confined_space_entry_ts: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Maintenance
# ---------------------------------------------------------------------------


class MaintenanceSchema(BaseModel):
    zone_id: str
    active: bool
    ts: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Plant state (aggregate response from /plant-state)
# ---------------------------------------------------------------------------


class ZoneStateSchema(BaseModel):
    zone: ZoneSchema
    gas: Optional[GasReadingSchema] = None
    permits: List[PermitSchema] = Field(default_factory=list)
    workers: List[WorkerSchema] = Field(default_factory=list)
    maintenance: Optional[MaintenanceSchema] = None


class PlantStateResponse(BaseModel):
    timestamp: datetime
    zones: List[ZoneStateSchema]
    simulator_elapsed_seconds: float


# ---------------------------------------------------------------------------
# Hazard score (from /hazard-score)
# ---------------------------------------------------------------------------


class AgentBreakdownSchema(BaseModel):
    gas_agent: float
    permit_agent: float
    worker_agent: float
    maintenance_agent: float
    interaction_bonus: float


class HazardScoreResponse(BaseModel):
    zone_id: str
    score: float = Field(..., ge=0, le=100)
    level: str  # Safe | Elevated | High | Critical
    signals: Dict[str, Any]
    per_agent_breakdown: AgentBreakdownSchema
    event_id: Optional[int] = None   # set if a new HazardEvent row was written
    timestamp: datetime


# ---------------------------------------------------------------------------
# Hazard explanation (from /hazard-explanation)
# ---------------------------------------------------------------------------


class HazardExplanationResponse(BaseModel):
    event_id: Optional[int] = None
    root_cause: str
    confidence: str
    actions: List[str]
    source: str  # "gemini" | "fallback"
    timestamp: datetime


# ---------------------------------------------------------------------------
# Similar incident (from /similar-incident — Day 8)
# ---------------------------------------------------------------------------


class SimilarIncidentResponse(BaseModel):
    incident_id: str
    title: str
    summary: str
    match_score: float
    tags: List[str]


# ---------------------------------------------------------------------------
# Incident report (from /incident-report — Day 8)
# ---------------------------------------------------------------------------


class IncidentReportResponse(BaseModel):
    report_text: str
    generated_at: datetime
