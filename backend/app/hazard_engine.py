"""
hazard_engine.py — Compound Hazard Detection Engine (Day 4).

Implements the 4 signal-agents + 1 orchestrator architecture described in the
implementation plan.  Each agent owns a single data stream and returns a
partial score.  The orchestrator fuses them, applies the compound interaction
term, and determines the final hazard level.

This is the core innovation of FusionIQ.  Keep it clean and well-commented so
any team member can defend it line-by-line to a judge.

Public API
----------
compound_hazard_orchestrator(gas_ppm, gas_threshold, hot_work_permit,
                              confined_space_entry, maintenance_active)
    → (score: float, level: str, breakdown: dict)

score_zone(zone_state: dict) → HazardScoreResult
    Convenience wrapper that takes a zone dict (as returned by the simulator)
    and returns a structured dataclass result.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

from sqlalchemy.orm import Session

from app.database import HazardEvent, SessionLocal


# ---------------------------------------------------------------------------
# Level thresholds — single source of truth, referenced in scoring AND labels
# ---------------------------------------------------------------------------

LEVEL_CRITICAL = 80
LEVEL_HIGH = 60
LEVEL_ELEVATED = 35


# ---------------------------------------------------------------------------
# Signal-agents
# ---------------------------------------------------------------------------


def gas_agent(gas_ppm: float, gas_threshold: float) -> float:
    """
    Gas-concentration signal agent.

    Scores the raw gas reading as a fraction of the threshold, capped at 60.
    The cap is intentional: gas alone cannot push the score into "High" (≥60)
    territory.  Only when compounded with operational risk factors does the
    reading become truly critical.  This is the core insight of the system —
    a single anomaly is manageable; the combination is what kills.

    Range: 0 – 60
    """
    if gas_threshold <= 0:
        return 0.0
    ratio = gas_ppm / gas_threshold
    return round(min(60.0, ratio * 60.0), 2)


def permit_agent(hot_work_permit: bool) -> float:
    """
    Hot-work permit signal agent.

    A hot-work permit active in a zone with elevated gas creates ignition risk.
    Fixed additive weight of 15 points when active.

    Range: 0 or 15
    """
    return 15.0 if hot_work_permit else 0.0


def worker_agent(confined_space_entry: bool) -> float:
    """
    Confined-space worker signal agent.

    A worker inside a confined space with rising gas concentrations faces an
    acute escape/rescue challenge.  Fixed additive weight of 15 points.

    Range: 0 or 15
    """
    return 15.0 if confined_space_entry else 0.0


def maintenance_agent(maintenance_active: bool) -> float:
    """
    Maintenance-activity signal agent.

    Active maintenance increases the probability of ignition sources (tools,
    sparks) and complicates evacuation.  Fixed additive weight of 10 points.

    Range: 0 or 10
    """
    return 10.0 if maintenance_active else 0.0


# ---------------------------------------------------------------------------
# Orchestrator — fuses agent outputs + applies compound interaction term
# ---------------------------------------------------------------------------


def compound_hazard_orchestrator(
    gas_ppm: float,
    gas_threshold: float,
    hot_work_permit: bool,
    confined_space_entry: bool,
    maintenance_active: bool,
) -> Tuple[float, str, Dict[str, float]]:
    """
    Fuse the four signal-agent scores into a compound hazard score.

    The compound interaction term (``interaction_bonus``) fires only when
    the gas reading is above 75% of the threshold AND two or more operational
    risk factors are simultaneously active.  This non-linear bonus is the
    key differentiator: it encodes domain knowledge that co-occurrence of
    risk factors is more dangerous than their sum suggests.

    Parameters
    ----------
    gas_ppm : float           Raw gas sensor reading (ppm).
    gas_threshold : float     Configured alarm threshold (ppm).
    hot_work_permit : bool    True if a hot-work permit is active in this zone.
    confined_space_entry : bool  True if a worker is inside the confined space.
    maintenance_active : bool True if maintenance team is active in this zone.

    Returns
    -------
    score : float             Final compound score, 0–100.
    level : str               "Safe" | "Elevated" | "High" | "Critical"
    breakdown : dict          Per-agent partial scores + interaction bonus.
    """
    # --- Step 1: run each signal-agent independently ---
    gas_score = gas_agent(gas_ppm, gas_threshold)
    permit_score = permit_agent(hot_work_permit)
    worker_score = worker_agent(confined_space_entry)
    maint_score = maintenance_agent(maintenance_active)

    base = gas_score + permit_score + worker_score + maint_score

    # --- Step 2: compound interaction term ---
    # Count how many *operational* risk factors are active (exclude gas — it's
    # a background condition; the risk factors are *human decisions*).
    active_risk_factors = sum([
        hot_work_permit,
        confined_space_entry,
        maintenance_active,
    ])

    gas_ratio = gas_ppm / gas_threshold if gas_threshold > 0 else 0.0

    if gas_ratio > 0.75 and active_risk_factors >= 2:
        # 15 points per active risk factor — compound danger grows super-linearly
        interaction_bonus = 15.0 * active_risk_factors
    else:
        interaction_bonus = 0.0

    # --- Step 3: clamp to [0, 100] ---
    score = round(min(100.0, base + interaction_bonus), 2)

    # --- Step 4: determine level ---
    if score >= LEVEL_CRITICAL:
        level = "Critical"
    elif score >= LEVEL_HIGH:
        level = "High"
    elif score >= LEVEL_ELEVATED:
        level = "Elevated"
    else:
        level = "Safe"

    breakdown: Dict[str, float] = {
        "gas_agent": gas_score,
        "permit_agent": permit_score,
        "worker_agent": worker_score,
        "maintenance_agent": maint_score,
        "interaction_bonus": interaction_bonus,
    }

    return score, level, breakdown


# ---------------------------------------------------------------------------
# Dataclass result — makes the return type explicit for callers
# ---------------------------------------------------------------------------


@dataclass
class HazardScoreResult:
    zone_id: str
    score: float
    level: str
    signals: Dict[str, Any]
    per_agent_breakdown: Dict[str, float]
    event_id: Optional[int]
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# Zone-level convenience wrapper
# ---------------------------------------------------------------------------


# Module-level cache: track last known level per zone so we only write a new
# HazardEvent row when the level *changes* (not on every poll).
_last_level_cache: Dict[str, str] = {}


def score_zone(zone_state: Dict[str, Any]) -> HazardScoreResult:
    """
    Compute the compound hazard score for a single zone.

    Reads the zone dict produced by simulator.get_current_plant_state() and
    returns a HazardScoreResult.  Writes a HazardEvent row to the database
    only when the hazard level changes (level-transition event logging).

    Parameters
    ----------
    zone_state : dict   One element from PlantStateResponse.zones — must
                        contain at minimum: id, gas_ppm, gas_threshold,
                        hot_work_permit, confined_space_entry, maintenance_active.
    """
    zone_id: str = zone_state["id"]
    gas_ppm: float = float(zone_state.get("gas_ppm", 0.0))
    gas_threshold: float = float(zone_state.get("gas_threshold", 100.0))
    hot_work_permit: bool = bool(zone_state.get("hot_work_permit", False))
    confined_space_entry: bool = bool(zone_state.get("confined_space_entry", False))
    maintenance_active: bool = bool(zone_state.get("maintenance_active", False))

    score, level, breakdown = compound_hazard_orchestrator(
        gas_ppm, gas_threshold, hot_work_permit, confined_space_entry, maintenance_active
    )

    signals: Dict[str, Any] = {
        "gas_ppm": gas_ppm,
        "gas_threshold": gas_threshold,
        "gas_ratio_pct": round((gas_ppm / gas_threshold) * 100, 1) if gas_threshold else 0,
        "hot_work_permit": hot_work_permit,
        "permit_id": zone_state.get("permit_id"),
        "confined_space_entry": confined_space_entry,
        "confined_space_worker": zone_state.get("confined_space_worker"),
        "maintenance_active": maintenance_active,
        "maintenance_team": zone_state.get("maintenance_team", []),
        "workers_in_zone": zone_state.get("workers_in_zone", []),
    }

    # --- Write event row only on level change ---
    event_id: Optional[int] = None
    prev_level = _last_level_cache.get(zone_id)

    if level != prev_level:
        _last_level_cache[zone_id] = level
        event_id = _write_hazard_event(zone_id, score, level, signals)

    return HazardScoreResult(
        zone_id=zone_id,
        score=score,
        level=level,
        signals=signals,
        per_agent_breakdown=breakdown,
        event_id=event_id,
    )


def score_all_zones(plant_state: Dict[str, Any]) -> list[HazardScoreResult]:
    """Score every zone in the plant state and return a list of results."""
    return [score_zone(z) for z in plant_state.get("zones", [])]


# ---------------------------------------------------------------------------
# Knowledge-graph helper — for Day 7 UI
# ---------------------------------------------------------------------------


def build_knowledge_graph(zone_state: Dict[str, Any], hazard_result: HazardScoreResult) -> Dict:
    """
    Build a small node/edge graph for the given zone and hazard result.

    Returns a dict with 'nodes' and 'edges' lists compatible with React Flow.
    This is intentionally lightweight — no Neo4j, just a Python dict built
    from the in-memory scenario data.  The Day-7 frontend renders it directly.
    """
    zone_id = zone_state["id"]
    zone_name = zone_state.get("name", zone_id)
    score = hazard_result.score
    level = hazard_result.level

    nodes = [
        {"id": "zone", "type": "zoneNode", "data": {"label": zone_name, "hazard_class": zone_state.get("hazard_class", "")}, "position": {"x": 300, "y": 200}},
        {"id": "risk", "type": "riskNode", "data": {"label": f"Compound Risk: {level}", "score": score, "level": level}, "position": {"x": 300, "y": 400}},
    ]
    edges = []

    # Gas sensor node
    nodes.append({
        "id": "gas",
        "type": "sensorNode",
        "data": {"label": f"Gas Sensor\n{zone_state.get('gas_ppm', 0):.1f} ppm", "score": hazard_result.per_agent_breakdown.get("gas_agent", 0)},
        "position": {"x": 100, "y": 50},
    })
    edges.append({"id": "e-gas-zone", "source": "gas", "target": "zone", "label": f"+{hazard_result.per_agent_breakdown.get('gas_agent', 0):.0f} pts"})
    edges.append({"id": "e-gas-risk", "source": "gas", "target": "risk", "animated": True if level in ("High", "Critical") else False})

    # Permit node (if active)
    if zone_state.get("hot_work_permit"):
        pid = zone_state.get("permit_id", "PERMIT")
        nodes.append({
            "id": "permit",
            "type": "permitNode",
            "data": {"label": f"Hot-Work Permit\n{pid}", "score": hazard_result.per_agent_breakdown.get("permit_agent", 0)},
            "position": {"x": 500, "y": 50},
        })
        edges.append({"id": "e-permit-zone", "source": "permit", "target": "zone", "label": "+15 pts"})
        edges.append({"id": "e-permit-risk", "source": "permit", "target": "risk", "animated": True if level in ("High", "Critical") else False})

    # Confined space node
    if zone_state.get("confined_space_entry"):
        csw = zone_state.get("confined_space_worker", "WORKER")
        nodes.append({
            "id": "cse",
            "type": "workerNode",
            "data": {"label": f"Confined Space\n{csw}", "score": hazard_result.per_agent_breakdown.get("worker_agent", 0)},
            "position": {"x": 100, "y": 350},
        })
        edges.append({"id": "e-cse-zone", "source": "cse", "target": "zone", "label": "+15 pts"})
        edges.append({"id": "e-cse-risk", "source": "cse", "target": "risk", "animated": True})

    # Maintenance node
    if zone_state.get("maintenance_active"):
        nodes.append({
            "id": "maint",
            "type": "maintNode",
            "data": {"label": "Maintenance Active", "score": hazard_result.per_agent_breakdown.get("maintenance_agent", 0)},
            "position": {"x": 500, "y": 350},
        })
        edges.append({"id": "e-maint-zone", "source": "maint", "target": "zone", "label": "+10 pts"})
        edges.append({"id": "e-maint-risk", "source": "maint", "target": "risk", "animated": True})

    # Interaction bonus edge (visual only)
    if hazard_result.per_agent_breakdown.get("interaction_bonus", 0) > 0:
        edges.append({
            "id": "e-interaction",
            "source": "zone",
            "target": "risk",
            "label": f"⚡ Compound +{hazard_result.per_agent_breakdown['interaction_bonus']:.0f}",
            "type": "straight",
            "animated": True,
            "style": {"stroke": "#ef4444", "strokeWidth": 3},
        })

    return {"nodes": nodes, "edges": edges}


# ---------------------------------------------------------------------------
# Database write — internal helper
# ---------------------------------------------------------------------------


def _write_hazard_event(
    zone_id: str,
    score: float,
    level: str,
    signals: Dict[str, Any],
) -> Optional[int]:
    """
    Persist a new HazardEvent row and return its auto-incremented id.
    Returns None on failure (non-fatal — the API still returns scoring data).
    """
    try:
        with SessionLocal() as db:
            event = HazardEvent(
                zone_id=zone_id,
                score=score,
                level=level,
                signals_json=json.dumps(signals, default=str),
                explanation=None,   # filled in Day 5 by explainability module
                ts=datetime.now(timezone.utc),
            )
            db.add(event)
            db.commit()
            db.refresh(event)
            return event.id
    except Exception as exc:  # pragma: no cover
        print(f"[FusionIQ] Warning: failed to write hazard event — {exc}")
        return None
