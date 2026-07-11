/**
 * App.jsx — FusionIQ Live Dashboard (Day 6 + Day 7)
 *
 * Polling:
 *   /plant-state     every 2 s  → raw sensor values + worker/permit data
 *   /hazard-score    every 2 s  → compound scores + per-agent breakdown
 *   /hazard-explanation  every 4 s  → Gemini root-cause + actions (cached server-side)
 *
 * Panels:
 *   Left column  — Geospatial Heatmap (Day 6), Permit list (Day 7)
 *   Right column — Compound Hazard Score + Agent breakdown (Day 6),
 *                  Gemini Explanation (Day 5/6), Worker tracking (Day 7)
 *   Bottom       — Knowledge Graph (Day 7), Similar Incident stub
 */

import { useEffect, useRef, useState } from 'react'
import HeatmapGrid from './components/HeatmapGrid'
import KnowledgeGraph from './components/KnowledgeGraph'

const BACKEND_URL = 'http://localhost:8000'

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

function Header({ connected, lastPoll, primaryLevel }) {
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

        {/* Connection + clock */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-surface-card border border-surface-border rounded-full px-3 py-1.5">
            <span className={`status-dot ${connected ? 'bg-safe animate-pulse-slow' : 'bg-critical'}`} />
            <span className="text-xs font-medium text-slate-300 hidden sm:inline">
              {connected ? 'Backend live' : 'Offline'}
            </span>
            {lastPoll && <span className="text-xs text-surface-muted ml-1">· {lastPoll}</span>}
          </div>
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

// ── Similar Incident stub (Day 8) ─────────────────────────────────────────────

function IncidentStub() {
  return (
    <div className="card animate-fade-in border-dashed">
      <div className="flex items-center justify-between mb-2">
        <p className="section-label mb-0">Similar Past Incident</p>
        <span className="text-[9px] text-surface-muted bg-surface border border-surface-border rounded px-1.5 py-0.5">Day 8</span>
      </div>
      <p className="text-xs text-surface-muted">
        RAG incident matcher wiring up Day 8 — will show the closest historical incident from the plant incident corpus.
      </p>
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [lastPoll, setLastPoll] = useState(null)

  const { data: plantState, error: plantError } = usePoll(`${BACKEND_URL}/plant-state`, 2000)
  const { data: hazardData, error: hazardError } = usePoll(`${BACKEND_URL}/hazard-score`, 2000)
  const { data: explanation } = usePoll(`${BACKEND_URL}/hazard-explanation`, 4000)

  useEffect(() => {
    if (plantState || hazardData) setLastPoll(new Date().toLocaleTimeString())
  }, [plantState, hazardData])

  const connected = !plantError && !hazardError && !!plantState
  const primaryZone = hazardData?.zones?.find(z => z.zone_id === 'zone-alpha')
  const primaryLevel = primaryZone?.level ?? 'Safe'

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
      <Header connected={connected} lastPoll={lastPoll} primaryLevel={primaryLevel} />

      <main className="flex-1 max-w-screen-2xl mx-auto w-full px-4 py-4 space-y-4">

        {/* ── Scenario clock bar ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-1">
          <ScenarioClock elapsedSeconds={plantState?.simulator_elapsed_seconds} />
          <div className="flex items-center gap-2 text-[10px] text-surface-muted">
            <span>Poll interval: 2s</span>
            <span>·</span>
            <span>1 real s = 2 scenario s</span>
          </div>
        </div>

        {/* ── Main grid ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

          {/* Left column — heatmap + permits */}
          <div className="lg:col-span-4 space-y-4">
            <HeatmapGrid zones={heatmapZones} />
            <PermitPanel plantState={plantState} />
            <IncidentStub />
          </div>

          {/* Right column — hazard panel + explanation + workers */}
          <div className="lg:col-span-8 space-y-4">

            {/* Top row: hazard score + explanation side by side on xl */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <HazardPanel hazardData={hazardData} explanation={explanation} />
              <div className="space-y-4">
                <ExplanationPanel explanation={explanation} />
                <WorkerPanel plantState={plantState} />
              </div>
            </div>

            {/* Knowledge graph — full width inside right column */}
            <KnowledgeGraph currentLevel={primaryLevel} />
          </div>
        </div>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="border-t border-surface-border py-3 text-center">
        <p className="text-[10px] text-surface-muted">
          FusionIQ · ET AI Hackathon 2026 · Day 7 build · Simulated sensor data · Backend: {BACKEND_URL}
        </p>
      </footer>
    </div>
  )
}
