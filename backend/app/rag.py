"""
rag.py — Lightweight RAG (Retrieval-Augmented Generation) for incident matching.

Day 8 implementation.

Approach: tag-overlap scoring against data/incidents.json.

Given the current hazard signals (gas, hot_work, confined_space, maintenance),
build a set of active tags and score each incident by how many tags overlap.
Ties broken by severity (Critical > High > Elevated > Safe) then by date
(most recent first).

This is intentionally simple — no vector DB, no embeddings.  The corpus is
15 entries which makes this exact-match lookup faster and more explainable
than semantic search.  The document notes this is a first-step RAG
implementation; a sentence-transformer upgrade is described as a roadmap item.
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional

# ---------------------------------------------------------------------------
# Load corpus once at import time
# ---------------------------------------------------------------------------

_CORPUS: List[Dict[str, Any]] = []
_CORPUS_LOADED = False


def _load_corpus() -> List[Dict[str, Any]]:
    global _CORPUS, _CORPUS_LOADED
    if _CORPUS_LOADED:
        return _CORPUS

    # Resolve path: backend/app/rag.py → backend/ → project root → data/
    _here = os.path.dirname(os.path.abspath(__file__))
    _project_root = os.path.dirname(os.path.dirname(_here))
    corpus_path = os.path.join(_project_root, "data", "incidents.json")

    try:
        with open(corpus_path, encoding="utf-8") as f:
            _CORPUS = json.load(f)
        _CORPUS_LOADED = True
    except FileNotFoundError:
        print(f"[RAG] incidents.json not found at {corpus_path} — corpus is empty.")
        _CORPUS = []
        _CORPUS_LOADED = True
    except json.JSONDecodeError as exc:
        print(f"[RAG] incidents.json parse error: {exc} — corpus is empty.")
        _CORPUS = []
        _CORPUS_LOADED = True

    return _CORPUS


# ---------------------------------------------------------------------------
# Tag derivation from current hazard signals
# ---------------------------------------------------------------------------

_SEVERITY_ORDER = {"Critical": 4, "High": 3, "Elevated": 2, "Safe": 1}


def signals_to_tags(signals: Dict[str, Any]) -> List[str]:
    """
    Derive the active hazard tag set from the current signal dict.

    Tag logic (mirrors the hazard engine thresholds):
      gas            — gas_ppm / gas_threshold > 0.5   (gas at ≥50% of threshold)
      hot_work       — hot_work_permit is truthy
      confined_space — confined_space_entry is truthy
      maintenance    — maintenance_active is truthy

    Returns a list of zero or more tag strings from the corpus vocabulary:
    ["gas", "hot_work", "confined_space", "maintenance"].
    """
    tags: List[str] = []

    gas_ppm = float(signals.get("gas_ppm", 0))
    gas_threshold = float(signals.get("gas_threshold", 100))
    if gas_threshold > 0 and (gas_ppm / gas_threshold) > 0.5:
        tags.append("gas")

    if signals.get("hot_work_permit"):
        tags.append("hot_work")

    if signals.get("confined_space_entry"):
        tags.append("confined_space")

    if signals.get("maintenance_active"):
        tags.append("maintenance")

    return tags


# ---------------------------------------------------------------------------
# Scorer
# ---------------------------------------------------------------------------


def _score_incident(incident: Dict[str, Any], active_tags: List[str]) -> int:
    """Return number of tags that overlap between active signal tags and incident tags."""
    active_set = set(active_tags)
    incident_set = set(incident.get("tags", []))
    return len(active_set & incident_set)


def find_similar_incident(
    signals: Dict[str, Any],
    top_k: int = 1,
) -> Optional[Dict[str, Any]]:
    """
    Return the top-k incidents most similar to the current hazard signals.

    If top_k == 1 returns a single dict or None.
    If top_k > 1 returns a list.

    Scoring:
    1. Tag-overlap count (higher is better).
    2. Severity tie-break (Critical > High > Elevated > Safe).
    3. Date tie-break (most recent first).
    """
    corpus = _load_corpus()
    if not corpus:
        return None if top_k == 1 else []

    active_tags = signals_to_tags(signals)

    scored = []
    for incident in corpus:
        overlap = _score_incident(incident, active_tags)
        severity_val = _SEVERITY_ORDER.get(incident.get("severity", "Safe"), 1)
        date_str = incident.get("date", "1900-01-01")
        scored.append((overlap, severity_val, date_str, incident))

    # Sort descending on (overlap, severity, date)
    scored.sort(key=lambda x: (x[0], x[1], x[2]), reverse=True)

    if top_k == 1:
        best_overlap, _, _, best_incident = scored[0]
        if best_overlap == 0:
            return None  # no match at all — don't return a zero-overlap result
        return _format_result(best_incident, best_overlap, active_tags)
    else:
        results = []
        for overlap, _, _, incident in scored[:top_k]:
            if overlap == 0:
                break
            results.append(_format_result(incident, overlap, active_tags))
        return results


def _format_result(
    incident: Dict[str, Any],
    overlap: int,
    active_tags: List[str],
) -> Dict[str, Any]:
    """Return a clean result dict to send to the frontend."""
    incident_tags = set(incident.get("tags", []))
    matching_tags = sorted(set(active_tags) & incident_tags)
    total_tags = len(incident_tags)
    similarity_pct = round((overlap / max(total_tags, 1)) * 100) if total_tags else 0

    return {
        "id": incident.get("id"),
        "title": incident.get("title"),
        "date": incident.get("date"),
        "location": incident.get("location"),
        "summary": incident.get("summary"),
        "root_cause": incident.get("root_cause"),
        "outcome": incident.get("outcome"),
        "severity": incident.get("severity"),
        "tags": incident.get("tags", []),
        "matching_tags": matching_tags,
        "overlap_score": overlap,
        "similarity_pct": similarity_pct,
        "simulated": incident.get("simulated", True),
        "source_note": incident.get("source_note", ""),
    }
