/**
 * App.jsx — FusionIQ Live Dashboard (Days 6 · 7 · 8 · 9)
 *
 * Polling:
 *   /plant-state       every 2 s  → raw sensor values + worker/permit data
 *   /hazard-score      every 2 s  → compound scores + per-agent breakdown
 *   /hazard-explanation  every 4 s  → Gemini root-cause + actions
 *   /similar-incident  every 6 s  → RAG tag-overlap incident match (Day 8)
 *
 * On-demand:
 *   /incident-report   fetch on button click → 7-section regulatory report
 *
 * Panels:
 *   Left column  — Geospatial Heatmap (Day 6), Permit list (Day 7),
 *                  Similar Incident card (Day 8)
 *   Right column — Compound Hazard Score + Agent breakdown + Report button (Day 6/8),
 *                  Gemini Explanation (Day 5), Worker tracking (Day 7)
 *   Bottom       — Knowledge Graph (Day 7)
 *   Modal        — Incident Report viewer + download (Day 8)
 */

import { useEffect, useRef, useState } from 'react'
import HeatmapGrid from './components/HeatmapGrid'
import KnowledgeGraph from './components/KnowledgeGraph'

// SettingsModal — Dynamic Backend URL Settings
function SettingsModal({ backendUrl, onSave, onClose }) {
  const [urlInput, setUrlInput] = useState(backendUrl)

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave(urlInput.trim())
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in text-white"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-surface-border p-6 shadow-2xl modal-enter space-y-4"
        style={{ background: '#0d1117' }}
      >
        <div className="flex items-center justify-between border-b border-surface-border pb-3">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <span>⚙</span> Connection Settings
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg border border-surface-border text-surface-muted hover:text-white hover:border-white/30 transition-all flex items-center justify-center text-sm"
          >
            ✕
          </button>
        </div>

        <div className="space-y-2">
          <label className="text-[11px] font-semibold text-surface-muted uppercase tracking-wider block">
            Backend API URL
          </label>
          <input
            type="text"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            className="w-full bg-surface border border-surface-border rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
            placeholder="http://localhost:8000"
            required
          />
          <p className="text-[10px] text-surface-muted leading-normal">
            Enter your deployed Render web service URL (e.g., <code className="font-mono">https://fusioniq-backend.onrender.com</code>).
            Changes are saved to local storage.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-surface-border">
          <button
            type="button"
            onClick={() => setUrlInput('http://localhost:8000')}
            className="text-xs font-semibold px-3 py-2 rounded-lg border border-surface-border text-surface-muted hover:text-white transition-all"
          >
            Reset Default
          </button>
          <button
            type="submit"
            className="text-xs font-bold px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-all shadow"
          >
            Save Settings
          </button>
        </div>
      </form>
    </div>
  )
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function levelClass(level) {
  return (
    level === 'Critical' ? 'critical' :
    level === 'High'     ? 'high'     :
    level === 'Elevated' ? 'elevated' :
    'safe'
  )
}

function levelColor(level) {
  return (
    level === 'Critical' ? '#ef4444' :
    level === 'High'     ? '#f97316' :
    level === 'Elevated' ? '#eab308' :
    '#22c55e'
  )
}

function LevelBadge({ level }) {
  if (!level) return null
  const cls = `badge-${levelClass(level)}`
  const dots = { Critical: '●', High: '◆', Elevated: '▲', Safe: '✓' }
  return <span className={cls}>{dots[level] ?? '●'} {level}</span>
}

function usePoll(url, intervalMs, enabled = true) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!enabled) return
    let mounted = true

    const fetch_ = async () => {
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        if (mounted) { setData(json); setError(null) }
      } catch (err) {
        if (mounted) setError(err.message)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    fetch_()
    const id = setInterval(fetch_, intervalMs)
    return () => { mounted = false; clearInterval(id) }
  }, [url, intervalMs, enabled])

  return { data, error, loading }
}

// ── Header ────────────────────────────────────────────────────────────────────

function Header({ connected, lastPoll, primaryLevel, onSettingsOpen }) {
  const levelCol = levelColor(primaryLevel)
  return (
    <header className="sticky top-0 z-20 border-b border-surface-border bg-surface/80 backdrop-blur-md">
      <div className="max-w-screen-2xl mx-auto px-5 py-2.5 flex items-center justify-between">
        {/* Logo + title */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
            <span className="text-white font-black text-xs">FQ</span>
          </div>
          <div>
            <h1 className="text-sm font-bold text-white leading-none tracking-wide">FusionIQ</h1>
            <p className="text-[10px] text-surface-muted leading-none mt-0.5">Industrial Decision Intelligence</p>
          </div>
        </div>

        {/* Live level ticker */}
        {primaryLevel && primaryLevel !== 'Safe' && (
          <div
            className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold animate-pulse"
            style={{ borderColor: `${levelCol}55`, color: levelCol, background: `${levelCol}11` }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: levelCol }} />
            Zone Alpha — {primaryLevel}
          </div>
        )}

        {/* Connection + settings */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-surface-card border border-surface-border rounded-full px-3 py-1.5 animate-fade-in">
            <span className={`status-dot ${connected ? 'bg-safe animate-pulse-slow' : 'bg-critical'}`} />
            <span className="text-xs font-medium text-slate-300 hidden sm:inline">
              {connected ? 'Backend live' : 'Offline'}
            </span>
            {lastPoll && <span className="text-xs text-surface-muted ml-1">· {lastPoll}</span>}
          </div>
          <button
            onClick={onSettingsOpen}
            className="w-8 h-8 rounded-full border border-surface-border bg-surface-card hover:bg-surface-border/50 text-slate-300 hover:text-white transition-all flex items-center justify-center text-sm shadow"
            title="Settings"
          >
            ⚙
          </button>
        </div>
      </div>
    </header>
  )
}

// ── Compact scenario clock ────────────────────────────────────────────────────

function ScenarioClock({ elapsedSeconds }) {
  if (elapsedSeconds == null) return null
  const m = Math.floor(elapsedSeconds / 60)
  const s = Math.floor(elapsedSeconds % 60)
  const label =
    elapsedSeconds < 50 ? '0:00 — Plant nominal' :
    elapsedSeconds < 80 ? '0:50 — Gas rising' :
    elapsedSeconds < 110 ? '1:20 — Hot-work permit issued' :
    elapsedSeconds < 140 ? '1:50 — Confined-space entry' :
    '2:20 — ALL FACTORS ACTIVE'

  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="font-mono text-surface-muted">Scenario</span>
      <span className="font-mono font-bold text-white tabular-nums">
        {String(m).padStart(2,'0')}:{String(s).padStart(2,'0')}
      </span>
      <span className="text-surface-muted hidden sm:inline">— {label}</span>
    </div>
  )
}

// ── Agent breakdown bar ───────────────────────────────────────────────────────

function AgentBar({ label, score, maxScore, color }) {
  const pct = maxScore > 0 ? Math.min(100, (score / maxScore) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-surface-muted">{label}</span>
        <span className="font-mono text-xs tabular-nums" style={{ color }}>{score.toFixed(0)} pts</span>
      </div>
      <div className="agent-bar-track">
        <div
          className="agent-bar-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  )
}

// ── Compound Hazard Panel ─────────────────────────────────────────────────────

function HazardPanel({ hazardData, explanation }) {
  const primaryZone = hazardData?.zones?.find(z => z.zone_id === 'zone-alpha')
  const score  = primaryZone?.score ?? 0
  const level  = primaryZone?.level ?? 'Safe'
  const bd     = primaryZone?.per_agent_breakdown ?? {}
  const color  = levelColor(level)

  const glow = level === 'Critical' ? 'animate-glow-critical' : level === 'High' ? 'animate-glow-high' : ''

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Score display */}
      <div
        className={`card relative overflow-hidden ${glow}`}
        style={{ borderColor: `${color}44`, transition: 'border-color 0.5s ease' }}
      >
        {/* Background radial gradient */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: `radial-gradient(ellipse at 50% 0%, ${color}10 0%, transparent 65%)` }}
        />

        <div className="relative">
          <div className="flex items-center justify-between mb-4">
            <p className="section-label mb-0">Compound Hazard Score</p>
            <LevelBadge level={level} />
          </div>

          {/* Big score */}
          <div className="flex items-end gap-3 mb-1">
            <span
              className="font-black leading-none tabular-nums"
              style={{ fontSize: 72, color, fontFamily: 'JetBrains Mono, monospace', transition: 'color 0.5s ease' }}
            >
              {Math.round(score)}
            </span>
            <div className="mb-3 text-surface-muted text-sm">/ 100</div>
          </div>

          {/* Score bar */}
          <div className="w-full h-3 rounded-full bg-surface-border mb-5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{ width: `${score}%`, background: `linear-gradient(90deg, ${color}99, ${color})` }}
            />
          </div>

          {/* Agent breakdown */}
          <p className="section-label mb-2">4 Signal-Agent Breakdown</p>
          <div className="space-y-2.5">
            <AgentBar label="Gas Agent"         score={bd.gas_agent         ?? 0} maxScore={60} color="#14b8a6" />
            <AgentBar label="Permit Agent"      score={bd.permit_agent      ?? 0} maxScore={15} color="#eab308" />
            <AgentBar label="Worker Agent"      score={bd.worker_agent      ?? 0} maxScore={15} color="#f97316" />
            <AgentBar label="Maintenance Agent" score={bd.maintenance_agent ?? 0} maxScore={10} color="#a855f7" />
          </div>

          {/* Interaction bonus */}
          {(bd.interaction_bonus ?? 0) > 0 && (
            <div className="mt-3 p-2.5 rounded-lg border border-critical/30 bg-critical/5 flex items-center gap-2">
              <span className="text-critical font-bold text-sm">⚡</span>
              <div>
                <span className="text-xs font-semibold text-critical">Compound Interaction Bonus</span>
                <span className="text-xs text-surface-muted ml-1.5">+{bd.interaction_bonus} pts</span>
                <p className="text-[10px] text-surface-muted mt-0.5">Fired: gas &gt;75% threshold + 2+ risk factors active</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Signals snapshot */}
      {primaryZone?.signals && (
        <div className="card">
          <p className="section-label">Live Signals — Zone Alpha</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="card-sm">
              <div className="text-surface-muted mb-0.5">Gas Concentration</div>
              <div className="data-value text-white">{primaryZone.signals.gas_ppm?.toFixed(1)} <span className="text-surface-muted font-sans">ppm</span></div>
              <div className="text-[10px] text-surface-muted">{primaryZone.signals.gas_ratio_pct?.toFixed(1)}% of LEL</div>
            </div>
            <div className={`card-sm ${primaryZone.signals.hot_work_permit ? 'border-elevated/40 bg-elevated/5' : ''}`}>
              <div className="text-surface-muted mb-0.5">Hot-Work Permit</div>
              <div className="data-value" style={{ color: primaryZone.signals.hot_work_permit ? '#eab308' : '#22c55e' }}>
                {primaryZone.signals.hot_work_permit ? 'ACTIVE' : 'None'}
              </div>
              {primaryZone.signals.permit_id && (
                <div className="text-[10px] text-surface-muted">{primaryZone.signals.permit_id}</div>
              )}
            </div>
            <div className={`card-sm ${primaryZone.signals.confined_space_entry ? 'border-high/40 bg-high/5' : ''}`}>
              <div className="text-surface-muted mb-0.5">Confined Space</div>
              <div className="data-value" style={{ color: primaryZone.signals.confined_space_entry ? '#f97316' : '#22c55e' }}>
                {primaryZone.signals.confined_space_entry ? 'OCCUPIED' : 'Clear'}
              </div>
              {primaryZone.signals.confined_space_worker && (
                <div className="text-[10px] text-surface-muted">{primaryZone.signals.confined_space_worker}</div>
              )}
            </div>
            <div className={`card-sm ${primaryZone.signals.maintenance_active ? 'border-purple-500/40 bg-purple-500/5' : ''}`}>
              <div className="text-surface-muted mb-0.5">Maintenance</div>
              <div className="data-value" style={{ color: primaryZone.signals.maintenance_active ? '#a855f7' : '#22c55e' }}>
                {primaryZone.signals.maintenance_active ? 'ACTIVE' : 'None'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Gemini Explanation Panel ──────────────────────────────────────────────────

function ExplanationPanel({ explanation }) {
  if (!explanation || explanation.detail) {
    return (
      <div className="card animate-fade-in">
        <p className="section-label">AI Explanation</p>
        <div className="flex items-center gap-2 text-xs text-surface-muted animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          Waiting for hazard event…
        </div>
      </div>
    )
  }

  const sourceTag = explanation.source === 'gemini'
    ? <span className="text-[9px] font-semibold text-blue-400 bg-blue-400/10 border border-blue-400/20 rounded px-1.5 py-0.5">gemini-2.0-flash</span>
    : <span className="text-[9px] font-semibold text-surface-muted bg-surface-border/50 border border-surface-border rounded px-1.5 py-0.5">fallback</span>

  return (
    <div className="card animate-fade-in space-y-4">
      <div className="flex items-center justify-between">
        <p className="section-label mb-0">AI Explanation</p>
        {sourceTag}
      </div>

      {/* Root cause */}
      <div>
        <p className="text-[10px] text-surface-muted uppercase font-semibold tracking-wider mb-1.5">Root Cause</p>
        <p className="text-sm text-slate-200 leading-relaxed">{explanation.root_cause}</p>
      </div>

      {/* Confidence */}
      <div>
        <p className="text-[10px] text-surface-muted uppercase font-semibold tracking-wider mb-1">Confidence</p>
        <p className="text-sm font-semibold text-safe">{explanation.confidence}</p>
      </div>

      {/* Actions */}
      {explanation.actions?.length > 0 && (
        <div>
          <p className="text-[10px] text-surface-muted uppercase font-semibold tracking-wider mb-2">Recommended Actions</p>
          <div className="space-y-2">
            {explanation.actions.map((action, i) => (
              <div key={i} className="action-item animate-slide-up" style={{ animationDelay: `${i * 0.1}s` }}>
                <span className="shrink-0 w-5 h-5 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-400 text-[10px] font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <p className="text-xs text-slate-300 leading-relaxed">{action}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Permit List Panel (Day 7) ─────────────────────────────────────────────────

function PermitPanel({ plantState }) {
  const allPermits = []
  for (const zone of plantState?.zones ?? []) {
    for (const permit of zone.active_permits ?? []) {
      allPermits.push({ ...permit, zone_id: zone.id, zone_name: zone.name, gas_ppm: zone.gas_ppm, gas_threshold: zone.gas_threshold })
    }
  }

  return (
    <div className="card animate-fade-in">
      <p className="section-label">Active Permits</p>
      {allPermits.length === 0 ? (
        <p className="text-xs text-surface-muted">No active permits.</p>
      ) : (
        <div className="space-y-2">
          {allPermits.map(permit => {
            const gasPct = permit.gas_ppm && permit.gas_threshold ? (permit.gas_ppm / permit.gas_threshold) * 100 : 0
            const isConflicting = gasPct > 75
            return (
              <div
                key={permit.id}
                className={`rounded-lg p-3 border text-xs ${isConflicting
                  ? 'border-critical/50 bg-critical/5'
                  : 'border-surface-border bg-surface'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-white font-mono">{permit.id}</span>
                  {isConflicting && <span className="text-critical text-[9px] font-bold">⚠ CONFLICT</span>}
                </div>
                <div className="text-surface-muted">{permit.type?.replace('_', ' ')} · {permit.zone_id}</div>
                {permit.description && <div className="text-slate-400 mt-0.5">{permit.description}</div>}
                {isConflicting && (
                  <div className="mt-1.5 text-[10px] text-critical">
                    Hot-work permit active while gas at {gasPct.toFixed(0)}% of LEL — high ignition risk
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Worker Tracking Panel (Day 7) ─────────────────────────────────────────────

function WorkerPanel({ plantState }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const allWorkers = []
  for (const zone of plantState?.zones ?? []) {
    for (const w of zone.workers ?? []) {
      allWorkers.push({ ...w, zone_id: zone.id, zone_name: zone.name, zone_level: zone.level ?? 'Safe' })
    }
  }

  return (
    <div className="card animate-fade-in">
      <p className="section-label">Worker Tracking</p>
      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
        {allWorkers.map(w => {
          const zColor = levelColor(w.zone_level)
          return (
            <div key={w.id} className="flex items-center gap-3 p-2 rounded-lg bg-surface border border-surface-border">
              {/* Avatar */}
              <div className="w-7 h-7 rounded-full bg-surface-border flex items-center justify-center text-[11px] font-bold text-white shrink-0">
                {w.name?.charAt(0) ?? '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-white truncate">{w.name}</span>
                  {w.in_confined_space && (
                    <span className="text-[9px] font-bold text-high bg-high/10 border border-high/30 rounded px-1">CS</span>
                  )}
                  {w.in_maintenance && (
                    <span className="text-[9px] font-bold text-purple-400 bg-purple-400/10 border border-purple-400/30 rounded px-1">MNT</span>
                  )}
                </div>
                <div className="text-[10px] text-surface-muted truncate">{w.role}</div>
              </div>
              {/* Zone indicator */}
              <div className="shrink-0 text-right">
                <div className="text-[9px] font-semibold" style={{ color: zColor }}>{w.zone_id}</div>
                <div className="text-[9px] text-surface-muted">{w.zone_level}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Similar Incident Panel (Day 8) ───────────────────────────────────────────

function IncidentPanel({ incidentData }) {
  const match = incidentData?.match
  const activeTags = incidentData?.active_tags ?? []

  const tagColor = t => ({
    gas:            '#14b8a6',
    hot_work:       '#eab308',
    confined_space: '#f97316',
    maintenance:    '#a855f7',
  }[t] ?? '#8892a4')

  const tagLabel = t => ({
    gas:            'Gas',
    hot_work:       'Hot-Work',
    confined_space: 'Confined Space',
    maintenance:    'Maintenance',
  }[t] ?? t)

  const sevColor = s => ({
    Critical: '#ef4444', High: '#f97316', Elevated: '#eab308', Safe: '#22c55e',
  }[s] ?? '#8892a4')

  return (
    <div className="card animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <p className="section-label mb-0">Similar Past Incident</p>
        <div className="flex items-center gap-1.5">
          {activeTags.length > 0 && (
            <div className="flex gap-1">
              {activeTags.map(t => (
                <span key={t}
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                  style={{ color: tagColor(t), background: `${tagColor(t)}18`, border: `1px solid ${tagColor(t)}44` }}
                >
                  {tagLabel(t)}
                </span>
              ))}
            </div>
          )}
          <span className="text-[9px] text-surface-muted bg-surface border border-surface-border rounded px-1.5 py-0.5">
            RAG · tag-overlap
          </span>
        </div>
      </div>

      {!incidentData && (
        <p className="text-xs text-surface-muted animate-pulse">Waiting for first match…</p>
      )}

      {incidentData && !match && (
        <div className="text-center py-4">
          <p className="text-xs text-surface-muted">No matching incident</p>
          <p className="text-[10px] text-surface-muted mt-1">Active tag overlap score: 0</p>
        </div>
      )}

      {match && (
        <div className="space-y-2">
          {/* Title + severity */}
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-semibold text-white leading-snug flex-1">{match.title}</p>
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
              style={{ color: sevColor(match.severity), background: `${sevColor(match.severity)}18`, border: `1px solid ${sevColor(match.severity)}44` }}
            >
              {match.severity}
            </span>
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-2 text-[10px] text-surface-muted">
            <span>{match.id}</span>
            <span>·</span>
            <span>{match.date}</span>
            <span>·</span>
            <span
              className="font-semibold"
              style={{ color: sevColor(match.severity) }}
            >
              {match.similarity_pct}% match
            </span>
          </div>

          {/* Matching tags */}
          {match.matching_tags?.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {match.matching_tags.map(t => (
                <span key={t}
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                  style={{ color: tagColor(t), background: `${tagColor(t)}18`, border: `1px solid ${tagColor(t)}44` }}
                >
                  ✓ {tagLabel(t)}
                </span>
              ))}
            </div>
          )}

          {/* Summary */}
          <p className="text-[11px] text-slate-300 leading-relaxed line-clamp-3">
            {match.summary}
          </p>

          {/* Root cause */}
          <div className="p-2 rounded-lg bg-surface border border-surface-border">
            <p className="text-[9px] text-surface-muted font-semibold uppercase tracking-wide mb-1">Historical Root Cause</p>
            <p className="text-[11px] text-slate-300 leading-snug">{match.root_cause}</p>
          </div>

          {/* Source note */}
          <p className="text-[9px] text-surface-muted italic">{match.source_note}</p>
        </div>
      )}
    </div>
  )
}

// ── Incident Report Modal (Day 8) ─────────────────────────────────────────────

function ReportModal({ report, level, score, onClose }) {
  const handleDownload = () => {
    const blob = new Blob([report], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fusioniq-incident-report-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const levelCol = levelColor(level)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="relative w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl border shadow-2xl modal-enter"
        style={{ background: '#0d1117', borderColor: `${levelCol}44` }}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{ background: `${levelCol}22`, border: `1px solid ${levelCol}55` }}>📋</div>
            <div>
              <p className="text-sm font-bold text-white">Incident Report</p>
              <p className="text-[10px] text-surface-muted">FusionIQ · Zone Alpha · Score {score?.toFixed(0)}/100 · {level}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors"
              style={{ color: levelCol, borderColor: `${levelCol}55`, background: `${levelCol}11` }}
            >
              ↓ Download .txt
            </button>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg border border-surface-border text-surface-muted hover:text-white hover:border-white/30 transition-colors flex items-center justify-center text-sm"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Report body */}
        <div className="flex-1 overflow-y-auto p-5">
          <pre
            className="text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap font-mono"
            style={{ fontFamily: 'JetBrains Mono, Fira Code, monospace' }}
          >
            {report}
          </pre>
        </div>

        {/* Disclaimer footer */}
        <div className="px-5 py-3 border-t border-surface-border shrink-0">
          <p className="text-[10px] text-surface-muted">
            ⚠ Prototype report generated from simulated data. Compliance references are generic — verify specific clauses against your plant's safety management system before any formal submission.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [lastPoll, setLastPoll] = useState(null)
  const [reportModal, setReportModal] = useState(null)   // { report, level, score } | null
  const [reportLoading, setReportLoading] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [backendUrl, setBackendUrl] = useState(() => {
    return localStorage.getItem('FUSIONIQ_BACKEND_URL') || import.meta.env.VITE_API_URL || 'http://localhost:8000';
  })

  const { data: plantState, error: plantError } = usePoll(`${backendUrl}/plant-state`, 2000)
  const { data: hazardData, error: hazardError } = usePoll(`${backendUrl}/hazard-score`, 2000)
  const { data: explanation } = usePoll(`${backendUrl}/hazard-explanation`, 4000)
  const { data: incidentData } = usePoll(`${backendUrl}/similar-incident`, 6000)

  useEffect(() => {
    if (plantState || hazardData) setLastPoll(new Date().toLocaleTimeString())
  }, [plantState, hazardData])

  const connected = !plantError && !hazardError && !!plantState
  const primaryZone = hazardData?.zones?.find(z => z.zone_id === 'zone-alpha')
  const primaryLevel = primaryZone?.level ?? 'Safe'

  const handleGenerateReport = async () => {
    setReportLoading(true)
    try {
      const res = await fetch(`${backendUrl}/incident-report`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setReportModal({ report: data.report, level: data.level, score: data.score })
    } catch (err) {
      alert(`Report generation failed: ${err.message}`)
    } finally {
      setReportLoading(false)
    }
  }

  const handleToggleStartPause = async () => {
    if (!plantState) return
    const endpoint = plantState.simulator_running ? 'pause' : 'start'
    try {
      const res = await fetch(`${backendUrl}/simulator/${endpoint}`, { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch (err) {
      alert(`Failed to ${endpoint} simulation: ${err.message}`)
    }
  }

  const handleRestart = async () => {
    try {
      // Reset scenario clock to 0
      const resReset = await fetch(`${backendUrl}/simulator/reset`, { method: 'POST' })
      if (!resReset.ok) throw new Error(`HTTP Reset ${resReset.status}`)
      // Start/Resume if paused
      const resStart = await fetch(`${backendUrl}/simulator/start`, { method: 'POST' })
      if (!resStart.ok) throw new Error(`HTTP Start ${resStart.status}`)
    } catch (err) {
      alert(`Failed to restart simulation: ${err.message}`)
    }
  }

  // Build heatmap zone list — merge plant state + hazard scores
  const heatmapZones = (plantState?.zones ?? []).map(zone => {
    const hz = hazardData?.zones?.find(z => z.zone_id === zone.id)
    return {
      id: zone.id,
      name: zone.name,
      x: zone.x,
      y: zone.y,
      score: hz?.score ?? 0,
      level: hz?.level ?? 'Safe',
      gas_ppm: zone.gas_ppm,
      gas_threshold: zone.gas_threshold,
    }
  })

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <Header
        connected={connected}
        lastPoll={lastPoll}
        primaryLevel={primaryLevel}
        onSettingsOpen={() => setSettingsOpen(true)}
      />

      <main className="flex-1 max-w-screen-2xl mx-auto w-full px-4 py-4 space-y-4">

        {/* ── Simulation Control Bar ────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 py-3 rounded-xl border border-surface-border bg-surface-card gap-3 shadow-lg">
          <div className="flex items-center gap-4">
            <ScenarioClock elapsedSeconds={plantState?.simulator_elapsed_seconds} />
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all ${
                plantState?.simulator_running
                  ? 'bg-safe/10 text-safe border-safe/30 animate-pulse-slow'
                  : 'bg-surface-muted/10 text-surface-muted border-surface-border'
              }`}
            >
              {plantState?.simulator_running ? '● Simulation Live' : '○ Simulation Paused'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleToggleStartPause}
              disabled={!connected}
              className="text-xs font-semibold px-4 py-2 rounded-lg border transition-all flex items-center gap-1.5 shadow disabled:opacity-50"
              style={{
                color: plantState?.simulator_running ? '#eab308' : '#22c55e',
                borderColor: plantState?.simulator_running ? '#eab30866' : '#22c55e66',
                background: plantState?.simulator_running ? '#eab30810' : '#22c55e10',
              }}
            >
              {plantState?.simulator_running ? (
                <>
                  <span>⏸</span> Pause Simulation
                </>
              ) : (
                <>
                  <span>▶</span> Start Simulation
                </>
              )}
            </button>
            <button
              onClick={handleRestart}
              disabled={!connected}
              className="text-xs font-semibold px-4 py-2 rounded-lg border border-surface-border text-slate-300 hover:text-white hover:bg-surface-border/50 transition-all flex items-center gap-1.5 shadow disabled:opacity-50"
            >
              <span>🔄</span> Restart Simulation
            </button>
            <div className="hidden md:flex items-center gap-2 text-[10px] text-surface-muted ml-2">
              <span>Poll: 2s</span>
              <span>·</span>
              <span>1s real = 2s scenario</span>
            </div>
          </div>
        </div>

        {/* ── Main grid ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

          {/* Left column — heatmap + permits + incident */}
          <div className="lg:col-span-4 space-y-4">
            <HeatmapGrid zones={heatmapZones} />
            <PermitPanel plantState={plantState} />
            <IncidentPanel incidentData={incidentData} />
          </div>

          {/* Right column — hazard panel + explanation + workers */}
          <div className="lg:col-span-8 space-y-4">

            {/* Report button — full width, above the panels */}
            <div className="flex items-center gap-3 p-3 rounded-xl border border-surface-border bg-surface-card">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white">Incident Report Generator</p>
                <p className="text-[10px] text-surface-muted">
                  Generates a 7-section regulatory-style report from current signals, AI explanation, and best-matching historical incident.
                </p>
              </div>
              <button
                onClick={handleGenerateReport}
                disabled={reportLoading}
                className="shrink-0 text-xs font-bold px-4 py-2 rounded-lg border transition-all disabled:opacity-50"
                style={{
                  color: levelColor(primaryLevel),
                  borderColor: `${levelColor(primaryLevel)}66`,
                  background: `${levelColor(primaryLevel)}15`,
                }}
              >
                {reportLoading ? '⏳ Generating…' : '📋 Generate Report'}
              </button>
            </div>

            {/* Top row: hazard score + explanation side by side on xl */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <HazardPanel hazardData={hazardData} explanation={explanation} />
              <div className="space-y-4">
                <ExplanationPanel explanation={explanation} />
                <WorkerPanel plantState={plantState} />
              </div>
            </div>

            {/* Knowledge graph — full width inside right column */}
            <KnowledgeGraph currentLevel={primaryLevel} backendUrl={backendUrl} />
          </div>
        </div>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="border-t border-surface-border py-3 text-center">
        <p className="text-[10px] text-surface-muted">
          FusionIQ · ET AI Hackathon 2026 · Day 8 build · Simulated sensor data · Backend: {backendUrl}
        </p>
      </footer>

      {/* ── Report Modal ───────────────────────────────────────────────── */}
      {reportModal && (
        <ReportModal
          report={reportModal.report}
          level={reportModal.level}
          score={reportModal.score}
          onClose={() => setReportModal(null)}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          backendUrl={backendUrl}
          onClose={() => setSettingsOpen(false)}
          onSave={(newUrl) => {
            setBackendUrl(newUrl)
            localStorage.setItem('FUSIONIQ_BACKEND_URL', newUrl)
          }}
        />
      )}
    </div>
  )
}
