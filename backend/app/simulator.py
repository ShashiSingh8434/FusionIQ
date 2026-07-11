"""
simulator.py — FusionIQ data simulator (Day 3).sdfg

Loads scenario.json and replays it in real time, interpolating between keyframes
and adding small ±2 ppm noise so values look like live sensor data rather than
a step function.

Time scale: 1 real second = 2 scenario seconds → full 160-second scenario arc
plays out in ~80 real seconds.

Public API
----------
get_current_plant_state() → dict
    Returns the current interpolated state of all zones.  Called by the
    /plant-state FastAPI route.
"""

from __future__ import annotations

import json
import os
import random
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

# ---------------------------------------------------------------------------
# Load scenario.json once at module import
# ---------------------------------------------------------------------------

_SCENARIO_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "data",
    "scenario.json",
)

with open(_SCENARIO_PATH, "r", encoding="utf-8") as _f:
    _SCENARIO: Dict[str, Any] = json.load(_f)

# Convenience references
_ZONES: List[Dict] = _SCENARIO["zones"]
_KEYFRAMES: List[Dict] = _SCENARIO["keyframes"]
_WORKERS_META: Dict[str, Dict] = {w["id"]: w for w in _SCENARIO["workers"]}
_PERMITS_META: List[Dict] = _SCENARIO["permits"]

# Time-scale factor: 1 real second represents this many scenario seconds
_TIME_SCALE: float = 2.0

# Total scenario duration in scenario seconds (last keyframe time)
_SCENARIO_DURATION_S: float = float(_KEYFRAMES[-1]["time_seconds"])

# Real-world duration: scenario runs on loop so demo can be repeated
_REAL_DURATION_S: float = _SCENARIO_DURATION_S / _TIME_SCALE

# ---------------------------------------------------------------------------
# Simulator state — module-level singleton, thread-safe with a lock
# ---------------------------------------------------------------------------

_start_time: float = time.monotonic()
_lock = threading.Lock()


def _reset_timer() -> None:
    """Restart the scenario clock from t=0. Called automatically when the
    scenario wraps around, ensuring an infinite loop for the live demo."""
    global _start_time
    with _lock:
        _start_time = time.monotonic()


# ---------------------------------------------------------------------------
# Interpolation helpers
# ---------------------------------------------------------------------------


def _lerp(a: float, b: float, t: float) -> float:
    """Linear interpolation between a and b; t in [0, 1]."""
    return a + (b - a) * t


def _interpolate_zone(
    zone_key: str,
    kf_prev: Dict,
    kf_next: Dict,
    t: float,
    scenario_elapsed: float,
) -> Dict[str, Any]:
    """
    Interpolate zone state between two keyframes.

    Continuous values (gas_ppm) are linearly interpolated + noised.
    Boolean flags take the value of kf_prev until the next keyframe is reached.
    """
    prev_zone = kf_prev.get(zone_key, {})
    next_zone = kf_next.get(zone_key, {})

    if not prev_zone:
        return {}

    # --- Gas PPM: interpolate + noise ---
    ppm_prev = float(prev_zone.get("gas_ppm", 0))
    ppm_next = float(next_zone.get("gas_ppm", ppm_prev))
    ppm_interp = _lerp(ppm_prev, ppm_next, t)
    # Add small ±2 ppm noise to look like a real sensor
    ppm_noisy = round(ppm_interp + random.uniform(-2.0, 2.0), 1)
    ppm_noisy = max(0.0, ppm_noisy)  # can't be negative

    threshold = float(prev_zone.get("gas_threshold", _SCENARIO["meta"]["gas_threshold_ppm"]))

    # --- Boolean flags: use prev value (step change at keyframe boundary) ---
    hot_work_permit = bool(prev_zone.get("hot_work_permit", False))
    confined_space_entry = bool(prev_zone.get("confined_space_entry", False))
    maintenance_active = bool(prev_zone.get("maintenance_active", False))

    # --- Workers in zone ---
    workers_in_zone: List[str] = prev_zone.get("workers_in_zone", [])

    # --- Permit reference ---
    permit_id: Optional[str] = prev_zone.get("permit_id")

    # --- Confined space worker ---
    cs_worker: Optional[str] = prev_zone.get("confined_space_worker")

    # --- Maintenance team ---
    maint_team: List[str] = prev_zone.get("maintenance_team", [])

    return {
        "gas_ppm": ppm_noisy,
        "gas_threshold": threshold,
        "hot_work_permit": hot_work_permit,
        "permit_id": permit_id,
        "confined_space_entry": confined_space_entry,
        "confined_space_worker": cs_worker,
        "maintenance_active": maintenance_active,
        "maintenance_team": maint_team,
        "workers_in_zone": workers_in_zone,
    }


def _find_surrounding_keyframes(scenario_elapsed: float):
    """
    Given a scenario-time elapsed value, find the immediately preceding and
    following keyframes and the interpolation factor t ∈ [0, 1].
    """
    kf_times = [kf["time_seconds"] for kf in _KEYFRAMES]

    # Before first keyframe
    if scenario_elapsed <= kf_times[0]:
        return _KEYFRAMES[0], _KEYFRAMES[0], 0.0

    # After last keyframe — hold last state
    if scenario_elapsed >= kf_times[-1]:
        return _KEYFRAMES[-1], _KEYFRAMES[-1], 1.0

    for i in range(len(_KEYFRAMES) - 1):
        t0 = kf_times[i]
        t1 = kf_times[i + 1]
        if t0 <= scenario_elapsed <= t1:
            span = t1 - t0
            t = (scenario_elapsed - t0) / span if span > 0 else 0.0
            return _KEYFRAMES[i], _KEYFRAMES[i + 1], t

    # Fallback — should never reach here
    return _KEYFRAMES[-1], _KEYFRAMES[-1], 1.0


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def get_elapsed_seconds() -> float:
    """Return real elapsed seconds since the scenario started (or last reset)."""
    with _lock:
        return time.monotonic() - _start_time


def get_scenario_elapsed_seconds() -> float:
    """
    Return scenario-time seconds elapsed, wrapping at scenario duration so the
    demo loops automatically.
    """
    real_elapsed = get_elapsed_seconds()
    scenario_elapsed = (real_elapsed * _TIME_SCALE) % _SCENARIO_DURATION_S
    return round(scenario_elapsed, 2)


def get_current_plant_state() -> Dict[str, Any]:
    """
    Return the current interpolated plant state for all zones.

    Return shape
    ------------
    {
        "timestamp": "2026-...",
        "simulator_elapsed_seconds": 47.3,         # scenario-time clock
        "zones": [
            {
                "id": "zone-alpha",
                "name": "...",
                "x": 2, "y": 1,
                "hazard_class": "HIGH_RISK",
                "gas_ppm": 86.4,
                "gas_threshold": 100,
                "hot_work_permit": true,
                "permit_id": "P-2026-042",
                "confined_space_entry": false,
                "confined_space_worker": null,
                "maintenance_active": false,
                "maintenance_team": [],
                "workers_in_zone": ["W-101", "W-102"],
                "workers": [            # enriched with name/role from scenario
                    {"id": "W-101", "name": "Rajesh Kumar", "role": "..."},
                    ...
                ],
                "active_permits": [     # permit objects for this zone (if any)
                    {"id": "P-2026-042", "type": "HOT_WORK", "status": "ACTIVE", ...}
                ]
            },
            ...
        ]
    }
    """
    scenario_elapsed = get_scenario_elapsed_seconds()
    kf_prev, kf_next, t = _find_surrounding_keyframes(scenario_elapsed)

    zones_state: List[Dict] = []

    # Zone keys inside a keyframe object (matches scenario.json naming)
    zone_key_map = {
        "zone-alpha": "zone_alpha",
        "zone-beta": "zone_beta",
        "zone-gamma": "zone_gamma",
    }

    for zone_def in _ZONES:
        zone_id = zone_def["id"]
        zone_key = zone_key_map.get(zone_id, zone_id.replace("-", "_"))

        zone_data = _interpolate_zone(zone_key, kf_prev, kf_next, t, scenario_elapsed)

        # Enrich workers list with name + role metadata
        workers_enriched = []
        for wid in zone_data.get("workers_in_zone", []):
            meta = _WORKERS_META.get(wid, {})
            workers_enriched.append({
                "id": wid,
                "name": meta.get("name", wid),
                "role": meta.get("role", "Unknown"),
                "in_confined_space": (wid == zone_data.get("confined_space_worker")),
                "in_maintenance": (wid in zone_data.get("maintenance_team", [])),
            })

        # Enrich active permits (only those assigned to this zone and currently active)
        active_permits = []
        pid = zone_data.get("permit_id")
        if pid and zone_data.get("hot_work_permit"):
            permit_meta = next(
                (p for p in _PERMITS_META if p["id"] == pid), None
            )
            if permit_meta:
                active_permits.append({
                    "id": permit_meta["id"],
                    "type": permit_meta["type"],
                    "description": permit_meta.get("description", ""),
                    "status": permit_meta["status"],
                    "conflicts_with": permit_meta.get("conflicts_with"),
                    "issued_at_seconds": permit_meta.get("issued_at_seconds"),
                })

        zones_state.append({
            "id": zone_id,
            "name": zone_def["name"],
            "x": zone_def["x"],
            "y": zone_def["y"],
            "hazard_class": zone_def["hazard_class"],
            **zone_data,
            "workers": workers_enriched,
            "active_permits": active_permits,
        })

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "simulator_elapsed_seconds": scenario_elapsed,
        "zones": zones_state,
    }


def reset_simulator() -> None:
    """Restart the scenario from t=0. Useful for testing or re-running the demo."""
    _reset_timer()
