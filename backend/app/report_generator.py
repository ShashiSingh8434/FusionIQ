"""
report_generator.py — Regulatory-style incident report formatter.

Day 8 implementation.

Covers the "Emergency Response Orchestrator" and "Compliance Audit Agent"
brief bullets as a lightweight first step:
  - Formats existing signals, score, Gemini explanation, similar past incident,
    and timestamp into a structured report.
  - Output is plain text with clear sections, suitable for display in the UI
    and export as .txt.

What this is NOT (document this honestly):
  - Not a real compliance system wired to OISD clause databases.
  - Not pushing to email/channel/ERP.
  - Not generating PDFs (no library dependency added).
  - Compliance references cite the applicable standards generically —
    specific clause numbers are NOT fabricated.

Framing in the document:
  "This report generator is a first-step implementation of the Emergency Response
  Orchestrator concept.  It demonstrates the output format and data pipeline.
  A production version would integrate with the plant's DCS, ERP (SAP PM),
  and the OISD/Factory Act clause database to auto-populate specific references."
"""

from __future__ import annotations

import textwrap
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


# ---------------------------------------------------------------------------
# Compliance references — generic, not fabricated clause numbers
# ---------------------------------------------------------------------------

_COMPLIANCE_REFS = """
APPLICABLE STANDARDS (generic reference — specific clauses to be verified
against current plant safety management system):

  • OISD Standard 116  — Fire Protection Facilities for Petroleum Depots,
                          Terminals, Pipeline Installations (gas detection)
  • OISD Standard 105  — Permits to Work System (hot-work / confined-space)
  • OISD Standard 117  — Fire Prevention and Control at Petroleum Refineries
  • The Factories Act, 1948 (as amended)
      – Section 36: Precautions against dangerous fumes, gases, and vapours
      – Section 36A: Precautions regarding portable electric light equipment
  • DGMS Circular 04/2023 — Confined Space Entry Safety
  • PNGRB Safety Code for Natural Gas Pipelines (for gas-carrying facilities)
""".strip()

_IMMEDIATE_ACTIONS_TEMPLATE = {
    "Critical": [
        "EVACUATE the zone immediately — all personnel to muster point.",
        "Activate plant emergency siren / PA system.",
        "Notify Emergency Response Team and site Safety Officer.",
        "Isolate gas supply / energy source at nearest upstream isolation valve.",
        "Do NOT re-enter zone until atmospheric test clears below 10% LEL.",
        "Initiate head-count at muster point.",
        "Notify Fire & Safety department; stand by fire suppression team.",
        "Preserve evidence — do not disturb work area until investigation team clears.",
    ],
    "High": [
        "Suspend all hot-work activities in the zone.",
        "Issue evacuation advisory to all personnel in the zone.",
        "Alert Safety Officer and shift supervisor.",
        "Increase ventilation; verify gas levels with calibrated detector.",
        "Halt all confined-space entries until atmospheric levels are confirmed safe.",
        "Confirm all work permits are suspended.",
    ],
    "Elevated": [
        "Alert shift supervisor and safety officer.",
        "Increase monitoring frequency to every 5 minutes.",
        "Confirm no additional hot-work or confined-space activities are initiated.",
        "Check ventilation system status.",
        "Stand by for escalation if score continues to rise.",
    ],
    "Safe": [
        "No immediate action required.",
        "Continue routine monitoring.",
    ],
}

_FOLLOW_UP_TEMPLATE = {
    "Critical": [
        "Conduct formal incident investigation within 24 hours (5-Why / Bow-Tie analysis).",
        "Submit OISD incident report to regulatory authority within 48 hours.",
        "Review and update the area risk assessment before resuming operations.",
        "Conduct permit-to-work system audit for the past 30 days.",
        "Brief all personnel on findings within 72 hours.",
        "Implement any recommended corrective actions before restart clearance.",
    ],
    "High": [
        "Review concurrent permit approvals for conflict gaps.",
        "Audit gas detector calibration records for the zone.",
        "Brief shift supervisors on compound-risk escalation pathway.",
        "Update HIRA (Hazard Identification and Risk Assessment) for the zone.",
    ],
    "Elevated": [
        "Monitor trends over the next 2 shift cycles.",
        "Verify permit cross-check procedure is being followed.",
        "Log event in the safety management system.",
    ],
    "Safe": [
        "No follow-up action required.",
        "Log event for trend analysis.",
    ],
}


# ---------------------------------------------------------------------------
# Main generator
# ---------------------------------------------------------------------------


def generate_incident_report(
    signals: Dict[str, Any],
    score: float,
    level: str,
    per_agent_breakdown: Dict[str, Any],
    explanation: Optional[Dict[str, Any]] = None,
    similar_incident: Optional[Dict[str, Any]] = None,
    zone_id: str = "zone-alpha",
    event_id: Optional[str] = None,
) -> str:
    """
    Format a regulatory-style incident report as a plain-text string.

    Parameters
    ----------
    signals              : Raw sensor signals from the hazard engine.
    score                : Compound hazard score (0–100).
    level                : Hazard level string (Safe/Elevated/High/Critical).
    per_agent_breakdown  : Dict with gas_agent, permit_agent, etc.
    explanation          : Gemini explanation dict (root_cause, confidence, actions).
    similar_incident     : Best matching past incident from rag.py.
    zone_id              : Zone identifier.
    event_id             : Database event ID if a level-change was recorded.
    """
    now = datetime.now(timezone.utc)
    timestamp = now.strftime("%Y-%m-%d %H:%M:%S UTC")
    report_id = f"FIQ-{now.strftime('%Y%m%d-%H%M%S')}"

    # ── Helper functions ──────────────────────────────────────────────────────

    def _hr(char: str = "─", width: int = 72) -> str:
        return char * width

    def _section(title: str) -> str:
        return f"\n{_hr()}\n  {title.upper()}\n{_hr()}\n"

    def _bullet(items: List[str], indent: int = 2) -> str:
        prefix = " " * indent
        return "\n".join(f"{prefix}• {item}" for item in items)

    def _wrap(text: str, indent: int = 4, width: int = 68) -> str:
        return textwrap.fill(
            text, width=width,
            initial_indent=" " * indent,
            subsequent_indent=" " * indent,
        )

    # ── Signal labels ─────────────────────────────────────────────────────────

    gas_ppm = signals.get("gas_ppm", 0)
    gas_threshold = signals.get("gas_threshold", 100)
    gas_pct_lel = round((gas_ppm / gas_threshold) * 100, 1) if gas_threshold else 0
    hot_work = "ACTIVE" if signals.get("hot_work_permit") else "Not active"
    confined = "ACTIVE" if signals.get("confined_space_entry") else "Not active"
    maint = "ACTIVE" if signals.get("maintenance_active") else "Not active"

    # ── Agent breakdown ───────────────────────────────────────────────────────

    gas_pts = per_agent_breakdown.get("gas_agent", 0)
    permit_pts = per_agent_breakdown.get("permit_agent", 0)
    worker_pts = per_agent_breakdown.get("worker_agent", 0)
    maint_pts = per_agent_breakdown.get("maintenance_agent", 0)
    bonus_pts = per_agent_breakdown.get("interaction_bonus", 0)

    # ── Explanation fields ────────────────────────────────────────────────────

    root_cause_text = "Not available (Gemini API not configured)."
    confidence_text = "N/A"
    actions_text = "See Immediate Actions section below."

    if explanation:
        root_cause_text = explanation.get("root_cause", root_cause_text)
        confidence_text = explanation.get("confidence", confidence_text)
        raw_actions = explanation.get("actions", [])
        if raw_actions:
            actions_text = "\n".join(f"  {i+1}. {a}" for i, a in enumerate(raw_actions))

    # ── Build report string ───────────────────────────────────────────────────

    lines: List[str] = []

    # Header
    lines += [
        "",
        "=" * 72,
        "  FUSIONIQ AUTOMATED SAFETY INCIDENT REPORT".center(72),
        "  Compound Industrial Hazard Detection System".center(72),
        "=" * 72,
        "",
        f"  Report ID   : {report_id}",
        f"  Generated   : {timestamp}",
        f"  Zone        : {zone_id.upper()}",
        f"  Event ID    : {event_id or 'N/A (no level-change event recorded)'}",
        f"  Hazard Level: {level.upper()}",
        f"  Compound Score: {score:.1f} / 100",
        "",
    ]

    # Section 1 — Incident Summary
    lines.append(_section("1. Incident Summary"))
    lines += [
        f"  Zone {zone_id.upper()} has reached HAZARD LEVEL: {level.upper()}",
        f"  Compound Risk Score: {score:.1f}/100",
        "",
        "  This report was generated automatically by the FusionIQ Compound",
        "  Hazard Detection System upon detection of a multi-factor safety",
        "  escalation event.  The compound score is derived from four independent",
        "  signal-agents (gas, permit, worker, maintenance) plus an interaction",
        "  bonus that fires when multiple risk factors are simultaneously active.",
        "",
    ]

    # Section 2 — Detected Signals
    lines.append(_section("2. Detected Signals"))
    lines += [
        f"  Gas Concentration    : {gas_ppm:.1f} ppm  ({gas_pct_lel:.1f}% of LEL threshold {gas_threshold:.0f} ppm)",
        f"  Hot-Work Permit      : {hot_work}",
        f"  Confined-Space Entry : {confined}",
        f"  Maintenance Activity : {maint}",
        "",
        "  Agent Score Breakdown:",
        f"    Gas Agent          : {gas_pts:.1f} pts  (max 60)",
        f"    Permit Agent       : {permit_pts:.1f} pts  (max 15)",
        f"    Worker Agent       : {worker_pts:.1f} pts  (max 15)",
        f"    Maintenance Agent  : {maint_pts:.1f} pts  (max 10)",
        f"    Interaction Bonus  : {bonus_pts:.1f} pts  (compound term)",
        f"    ─────────────────────",
        f"    TOTAL SCORE        : {score:.1f} / 100",
        "",
    ]

    # Section 3 — AI Root Cause Analysis
    lines.append(_section("3. AI-Assisted Root Cause Analysis"))
    lines += [
        "  Root Cause (Gemini gemini-2.0-flash):",
        _wrap(root_cause_text, indent=4),
        "",
        f"  Confidence  : {confidence_text}",
        "",
        "  Recommended Actions (from AI analysis):",
        actions_text,
        "",
    ]

    # Section 4 — Immediate Actions
    actions = _IMMEDIATE_ACTIONS_TEMPLATE.get(level, _IMMEDIATE_ACTIONS_TEMPLATE["Safe"])
    lines.append(_section("4. Immediate Actions Required"))
    lines.append(_bullet(actions))
    lines.append("")

    # Section 5 — Similar Past Incident
    lines.append(_section("5. Similar Historical Incident"))
    if similar_incident:
        sim_tags = ", ".join(similar_incident.get("matching_tags", []))
        lines += [
            f"  Matched Incident : {similar_incident.get('id')} — {similar_incident.get('title')}",
            f"  Date             : {similar_incident.get('date')}",
            f"  Location         : {similar_incident.get('location')}",
            f"  Severity         : {similar_incident.get('severity')}",
            f"  Overlap Tags     : {sim_tags}  ({similar_incident.get('similarity_pct')}% tag match)",
            "",
            "  Summary:",
            _wrap(similar_incident.get("summary", ""), indent=4),
            "",
            "  Historical Root Cause:",
            _wrap(similar_incident.get("root_cause", ""), indent=4),
            "",
            "  Historical Outcome:",
            _wrap(similar_incident.get("outcome", ""), indent=4),
            "",
            f"  Source Note: {similar_incident.get('source_note', '')}",
            "",
        ]
    else:
        lines += [
            "  No closely matching historical incident found in the corpus.",
            "  (Tag-overlap score was 0 for all 15 incidents in incidents.json.)",
            "",
        ]

    # Section 6 — Recommended Follow-up
    follow_up = _FOLLOW_UP_TEMPLATE.get(level, _FOLLOW_UP_TEMPLATE["Safe"])
    lines.append(_section("6. Recommended Follow-up Actions"))
    lines.append(_bullet(follow_up))
    lines.append("")

    # Section 7 — Compliance Reference
    lines.append(_section("7. Compliance Reference"))
    lines.append(_COMPLIANCE_REFS)
    lines.append("")

    # Footer
    lines += [
        _hr("─"),
        "  DISCLAIMER: This report was generated automatically by the FusionIQ",
        "  prototype system using simulated sensor data.  It is intended as a",
        "  demonstration of the Compound Hazard Detection + AI Explanation pipeline.",
        "  In a production deployment, this report would be validated by the",
        "  Safety Officer before any formal submission to regulatory authorities.",
        _hr("─"),
        "",
    ]

    return "\n".join(lines)
