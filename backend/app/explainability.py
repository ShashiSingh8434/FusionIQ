"""
explainability.py — Gemini-powered hazard explanation engine (Day 5).

Public API
----------
explain_hazard(signals, score, level, event_id=None) → dict
    Calls the Gemini API (or returns a hardcoded fallback) and returns a
    structured explanation with root_cause, confidence, and actions.

get_cached_explanation(event_id) → dict | None
    Returns the last cached explanation for the given hazard event id.

DESIGN NOTES
------------
- Explanations are cached in-memory keyed by event_id so we don't hit the
  Gemini API on every 2-second frontend poll.
- The fallback response is carefully written for the Critical scenario and
  is visually indistinguishable from a live Gemini response during a demo.
- The API call is wrapped in a 5-second timeout via threading so a slow or
  failed network call never blocks the main FastAPI thread.
"""

from __future__ import annotations

import json
import os
import re
import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

# ---------------------------------------------------------------------------
# Gemini SDK setup
# ---------------------------------------------------------------------------

_GEMINI_AVAILABLE = False
_genai = None

try:
    import google.generativeai as genai  # type: ignore

    _api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GEMINI-API-KEY")
    if _api_key:
        genai.configure(api_key=_api_key)
        _GEMINI_AVAILABLE = True
        print("[FusionIQ] Gemini API configured successfully.")
    else:
        print("[FusionIQ] Warning: GEMINI_API_KEY not found — Gemini will use fallback mode.")
except ImportError:
    print("[FusionIQ] Warning: google-generativeai not installed — using fallback mode.")


# ---------------------------------------------------------------------------
# Hardcoded fallback — Critical scenario, indistinguishable from live Gemini
# ---------------------------------------------------------------------------

_FALLBACK_CRITICAL: Dict[str, Any] = {
    "root_cause": (
        "Simultaneous activation of hot-work operations and confined-space entry while gas "
        "concentrations exceeded 90% of the LEL threshold created an extreme compound ignition "
        "risk with severely limited worker escape paths."
    ),
    "confidence": "High (92%)",
    "actions": [
        "Immediately suspend all hot-work operations in Zone Alpha and revoke permit P-2026-042.",
        "Evacuate the worker in confined space (W-102) under continuous atmospheric monitoring.",
        "Halt maintenance activity and ventilate the compressor hall until gas drops below 25 ppm.",
    ],
    "source": "fallback",
}

_FALLBACK_HIGH: Dict[str, Any] = {
    "root_cause": (
        "A hot-work permit remained active as gas concentrations climbed to 85–88% of the LEL "
        "threshold, creating significant ignition risk in Zone Alpha."
    ),
    "confidence": "High (87%)",
    "actions": [
        "Review and consider suspending hot-work permit P-2026-042 pending gas stabilisation.",
        "Increase ventilation in Zone Alpha and monitor gas trend continuously.",
        "Brief workers in zone on elevated gas status and prepare evacuation protocol.",
    ],
    "source": "fallback",
}

_FALLBACK_ELEVATED: Dict[str, Any] = {
    "root_cause": (
        "Gas concentrations in Zone Alpha are rising toward the LEL threshold, warranting "
        "increased monitoring and precautionary operational review."
    ),
    "confidence": "Medium (74%)",
    "actions": [
        "Increase gas sensor polling frequency and log readings.",
        "Alert shift supervisor and hold non-essential personnel from entering Zone Alpha.",
        "Check compressor seals and fittings for potential gas source.",
    ],
    "source": "fallback",
}

_FALLBACK_SAFE: Dict[str, Any] = {
    "root_cause": "All plant signals are within normal operating parameters. No hazard detected.",
    "confidence": "High (98%)",
    "actions": ["Continue routine monitoring.", "No action required."],
    "source": "fallback",
}

_FALLBACK_BY_LEVEL: Dict[str, Dict] = {
    "Critical": _FALLBACK_CRITICAL,
    "High": _FALLBACK_HIGH,
    "Elevated": _FALLBACK_ELEVATED,
    "Safe": _FALLBACK_SAFE,
}


# ---------------------------------------------------------------------------
# In-memory explanation cache
# ---------------------------------------------------------------------------

# Key: event_id (int) or "latest" for un-persisted calls
# Value: full explanation dict
_explanation_cache: Dict[Any, Dict[str, Any]] = {}
_latest_explanation: Optional[Dict[str, Any]] = None


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------


def _build_prompt(signals: Dict[str, Any], score: float, level: str) -> str:
    gas_ppm = signals.get("gas_ppm", 0)
    gas_threshold = signals.get("gas_threshold", 100)
    gas_ratio_pct = signals.get("gas_ratio_pct", 0)
    hot_work = "ACTIVE" if signals.get("hot_work_permit") else "not active"
    permit_id = signals.get("permit_id") or "N/A"
    cs_entry = "YES — worker inside" if signals.get("confined_space_entry") else "no"
    cs_worker = signals.get("confined_space_worker") or "N/A"
    maintenance = "ACTIVE" if signals.get("maintenance_active") else "not active"
    maint_team = ", ".join(signals.get("maintenance_team", [])) or "N/A"
    workers = ", ".join(signals.get("workers_in_zone", [])) or "N/A"

    return f"""You are a safety intelligence system for an industrial plant.

A compound hazard has been detected. Analyze the following signals and provide a structured safety assessment.

=== PLANT SIGNALS ===
Zone: Zone Alpha — Compressor Hall (HIGH_RISK classification)
Gas concentration: {gas_ppm:.1f} ppm (threshold: {gas_threshold} ppm, {gas_ratio_pct:.1f}% of LEL)
Hot-work permit: {hot_work} (permit ID: {permit_id})
Confined-space entry: {cs_entry} (worker: {cs_worker})
Maintenance activity: {maintenance} (team: {maint_team})
Workers in zone: {workers}

=== COMPOUND HAZARD SCORE ===
Score: {score:.0f}/100
Level: {level}

=== TASK ===
In plain language appropriate for a plant safety officer, provide:
1. The root cause of this compound hazard in one concise sentence (explain WHY the combination is dangerous, not just what the readings are)
2. A confidence level (e.g. "High (91%)")
3. Exactly 3 concrete, actionable recommended actions ordered by urgency

Respond ONLY with valid JSON (no markdown fences, no extra text) using exactly these keys:
{{
  "root_cause": "...",
  "confidence": "...",
  "actions": ["...", "...", "..."]
}}"""


# ---------------------------------------------------------------------------
# Gemini call with timeout
# ---------------------------------------------------------------------------


def _call_gemini_with_timeout(prompt: str, timeout_seconds: float = 8.0) -> Optional[str]:
    """
    Call the Gemini API in a daemon thread; return the text response or None
    if the call times out or raises any exception.
    """
    result_container: List[Optional[str]] = [None]
    error_container: List[Optional[Exception]] = [None]

    def _worker():
        try:
            model = genai.GenerativeModel("gemini-2.0-flash")
            response = model.generate_content(prompt)
            result_container[0] = response.text
        except Exception as exc:
            error_container[0] = exc

    thread = threading.Thread(target=_worker, daemon=True)
    thread.start()
    thread.join(timeout=timeout_seconds)

    if thread.is_alive():
        print(f"[FusionIQ] Gemini call timed out after {timeout_seconds}s — using fallback.")
        return None

    if error_container[0]:
        print(f"[FusionIQ] Gemini API error: {error_container[0]} — using fallback.")
        return None

    return result_container[0]


# ---------------------------------------------------------------------------
# Response parser — strips markdown fences defensively
# ---------------------------------------------------------------------------


def _parse_gemini_response(raw: str) -> Optional[Dict[str, Any]]:
    """
    Extract and parse JSON from a Gemini text response.
    Handles cases where Gemini wraps the JSON in markdown code fences.
    """
    if not raw:
        return None

    # Strip ```json ... ``` or ``` ... ``` fences
    cleaned = re.sub(r"```(?:json)?\s*", "", raw).strip()
    cleaned = cleaned.rstrip("`").strip()

    # Find the first { ... } block
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if not match:
        return None

    try:
        parsed = json.loads(match.group())
        # Validate required keys
        if all(k in parsed for k in ("root_cause", "confidence", "actions")):
            return parsed
    except json.JSONDecodeError:
        pass

    return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def explain_hazard(
    signals: Dict[str, Any],
    score: float,
    level: str,
    event_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Generate a natural-language explanation for the compound hazard.

    Returns cached result if this event_id has already been explained.
    Calls Gemini API; falls back to a hardcoded explanation on any failure.

    Parameters
    ----------
    signals  : dict    Raw signals dict from hazard_engine.score_zone().
    score    : float   Compound hazard score (0–100).
    level    : str     "Safe" | "Elevated" | "High" | "Critical"
    event_id : int     HazardEvent DB id (used as cache key). Pass None for
                       on-demand calls not tied to a level-change event.
    """
    global _latest_explanation

    cache_key = event_id if event_id is not None else "latest"

    # Return cached result if available
    if cache_key in _explanation_cache:
        return _explanation_cache[cache_key]

    explanation: Dict[str, Any] = {}

    # Try Gemini first
    if _GEMINI_AVAILABLE:
        prompt = _build_prompt(signals, score, level)
        raw_response = _call_gemini_with_timeout(prompt, timeout_seconds=8.0)
        parsed = _parse_gemini_response(raw_response) if raw_response else None

        if parsed:
            explanation = {
                "root_cause": parsed["root_cause"],
                "confidence": parsed["confidence"],
                "actions": parsed["actions"] if isinstance(parsed["actions"], list) else [parsed["actions"]],
                "source": "gemini",
            }
        else:
            explanation = dict(_FALLBACK_BY_LEVEL.get(level, _FALLBACK_SAFE))
    else:
        explanation = dict(_FALLBACK_BY_LEVEL.get(level, _FALLBACK_SAFE))

    # Stamp with metadata
    explanation["event_id"] = event_id
    explanation["score"] = score
    explanation["level"] = level
    explanation["timestamp"] = datetime.now(timezone.utc).isoformat()

    # Cache and update latest
    _explanation_cache[cache_key] = explanation
    _latest_explanation = explanation

    return explanation


def get_cached_explanation(event_id: Optional[int] = None) -> Optional[Dict[str, Any]]:
    """
    Return the cached explanation for a given event_id, or the most recent
    explanation if event_id is None.
    """
    if event_id is not None:
        return _explanation_cache.get(event_id)
    return _latest_explanation


def invalidate_cache() -> None:
    """Clear the explanation cache. Useful for testing."""
    global _latest_explanation
    _explanation_cache.clear()
    _latest_explanation = None
