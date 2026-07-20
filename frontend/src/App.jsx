/**
 * App.jsx — FusionIQ Operational Intelligence Platform
 *
 * Visual: Stitch design system (Quiet Precision / industrial graphite)
 * Logic:  100% original FusionIQ — all endpoints, hooks, state preserved
 *
 * Polling:
 *   /plant-state         every 2 s
 *   /hazard-score        every 2 s
 *   /hazard-explanation  every 4 s
 *   /similar-incident    every 6 s
 *
 * On-demand:
 *   /incident-report     fetch on button click
 */

import { useEffect, useState } from 'react'
import HeatmapGrid from './components/HeatmapGrid'
import KnowledgeGraph from './components/KnowledgeGraph'

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
    level === 'Critical' ? '#ffb4ab' :
    level === 'High'     ? '#f97316' :
    level === 'Elevated' ? '#fabd34' :
    '#45dfa4'
  )
}

function LevelBadge({ level }) {
  if (!level) return null
  const cls = `badge-${levelClass(level)}`
  const icons = { Critical: '●', High: '◆', Elevated: '▲', Safe: '✓' }
  return <span className={cls}>{icons[level] ?? '●'} {level}</span>
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

// ── Settings Modal ────────────────────────────────────────────────────────────

function SettingsModal({ backendUrl, onSave, onClose }) {
  const envUrl = import.meta.env.VITE_API_URL
  const defaultUrl = envUrl || 'http://localhost:8000'
  const [urlInput, setUrlInput] = useState(backendUrl)

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave(urlInput.trim())
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md modal-enter"
        style={{ background: '#1d2025', border: '1px solid #414751', borderRadius: '0.5rem', padding: '1.5rem' }}
      >
        <div className="flex items-center justify-between mb-5 pb-4" style={{ borderBottom: '1px solid #414751' }}>
          <h3 className="text-sm font-semibold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">settings</span>
            Connection Settings
          </h3>
          <button type="button" onClick={onClose} className="icon-btn">✕</button>
        </div>

        <div className="space-y-4 mb-5">
          <div>
            <label className="section-label mb-2 block">Backend API URL</label>
            <input
              type="text"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              className="w-full text-xs font-mono text-on-surface focus:outline-none"
              style={{
                background: '#272a30',
                border: '1px solid #414751',
                borderRadius: '0.25rem',
                padding: '0.5rem 0.75rem',
              }}
              placeholder="http://localhost:8000"
              required
            />
          </div>

          <div
            className="p-3 rounded text-xs flex flex-col gap-2"
            style={{ background: '#101419', border: '1px solid #2d3139' }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium" style={{ color: '#8b919d' }}>
                Environment Variable (<code className="font-mono text-[#60a5fa]">.env</code>):
              </span>
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                style={{ background: envUrl ? 'rgba(96,165,250,0.15)' : 'rgba(255,180,171,0.15)', color: envUrl ? '#60a5fa' : '#ffb4ab' }}
              >
                {envUrl ? 'Loaded' : 'Not Set'}
              </span>
            </div>
            {envUrl ? (
              <div className="flex items-center justify-between gap-2 pt-1" style={{ borderTop: '1px dashed #2d3139' }}>
                <code className="font-mono text-[11px] truncate text-on-surface" title={envUrl}>
                  {envUrl}
                </code>
                <button
                  type="button"
                  onClick={() => setUrlInput(envUrl)}
                  className="px-2 py-1 text-[10px] font-semibold rounded shrink-0 transition-colors"
                  style={{ background: 'rgba(96,165,250,0.2)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.4)' }}
                >
                  Use .env URL
                </button>
              </div>
            ) : (
              <p className="text-[10px]" style={{ color: '#8b919d' }}>
                Define <code className="font-mono">VITE_API_URL</code> in <code className="font-mono">frontend/.env</code> to configure default URL.
              </p>
            )}
          </div>

          <p className="text-[10px]" style={{ color: '#8b919d' }}>
            Enter your backend API endpoint or click <strong>Use .env URL</strong>. Changes persist to <code className="font-mono">localStorage</code>.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-4" style={{ borderTop: '1px solid #414751' }}>
          <button
            type="button"
            onClick={() => setUrlInput(defaultUrl)}
            className="btn-ghost text-xs"
          >
            Reset Default
          </button>
          <button
            type="submit"
            className="btn text-xs"
            style={{ background: '#60a5fa', color: '#00315d', borderColor: '#60a5fa', fontWeight: 600 }}
          >
            Save Settings
          </button>
        </div>
      </form>
    </div>
  )
}

// ── Scenario Clock ────────────────────────────────────────────────────────────

function ScenarioClock({ elapsedSeconds }) {
  if (elapsedSeconds == null) return null
  const m = Math.floor(elapsedSeconds / 60)
  const s = Math.floor(elapsedSeconds % 60)
  const phase =
    elapsedSeconds < 50  ? '01: Plant Nominal' :
    elapsedSeconds < 80  ? '02: Gas Rising' :
    elapsedSeconds < 110 ? '03: Hot-Work Permit' :
    elapsedSeconds < 140 ? '04: Confined Space Entry' :
    '05: All Factors Active'

  return (
    <div className="flex items-center gap-4">
      <div className="flex flex-col">
        <span className="text-[9px] uppercase tracking-wider" style={{ color: '#8b919d' }}>Scenario</span>
        <span className="text-on-surface text-xs">{phase}</span>
      </div>
      <div className="flex flex-col">
        <span className="text-[9px] uppercase tracking-wider" style={{ color: '#8b919d' }}>Sim Time</span>
        <span className="text-on-surface text-xs font-mono tabular-nums">
          {String(m).padStart(2,'0')}:{String(s).padStart(2,'0')}
        </span>
      </div>
    </div>
  )
}

// ── Header ────────────────────────────────────────────────────────────────────

function Header({ connected, lastPoll, primaryLevel, simRunning, onSettingsOpen, onStartPause, onRestart, elapsedSeconds, backendUrl }) {
  return (
    <header
      className="flex justify-between items-center px-8 w-full shrink-0 z-50"
      style={{
        background: '#1d2025',
        borderBottom: '1px solid #414751',
        height: '3.5rem',
      }}
    >
      {/* Left: Logo + nav info */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 flex items-center justify-center font-bold text-sm"
            style={{ background: '#60a5fa', color: '#003a6b', borderRadius: '0.25rem' }}
          >
            FQ
          </div>
          <div>
            <h1 className="text-on-surface font-semibold leading-none" style={{ fontSize: '15px' }}>FusionIQ</h1>
            <span className="text-[10px] tracking-wide" style={{ color: '#8b919d' }}>Operational Intelligence</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Backend status */}
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-full"
            style={{
              background: connected ? 'rgba(69,223,164,0.10)' : 'rgba(255,180,171,0.10)',
              border: `1px solid ${connected ? 'rgba(69,223,164,0.25)' : 'rgba(255,180,171,0.25)'}`,
            }}
          >
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: connected ? '#45dfa4' : '#ffb4ab' }}
            />
            <span className="text-xs font-medium" style={{ color: connected ? '#45dfa4' : '#ffb4ab' }}>
              {connected ? 'Backend Online' : 'Offline'}
            </span>
          </div>

          {/* Scenario + sim time */}
          <ScenarioClock elapsedSeconds={elapsedSeconds} />

          {/* Poll rate */}
          <div className="flex flex-col">
            <span className="text-[9px] uppercase tracking-wider" style={{ color: '#8b919d' }}>Poll Rate</span>
            <span className="text-on-surface text-xs">2s</span>
          </div>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onStartPause}
          disabled={!connected}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold transition-opacity"
          style={{
            background: simRunning ? 'rgba(250,189,52,0.12)' : '#45dfa4',
            color: simRunning ? '#fabd34' : '#003825',
            border: `1px solid ${simRunning ? 'rgba(250,189,52,0.3)' : '#45dfa4'}`,
            borderRadius: '0.25rem',
            opacity: connected ? 1 : 0.4,
            cursor: connected ? 'pointer' : 'not-allowed',
          }}
        >
          <span className="material-symbols-outlined text-[16px]">{simRunning ? 'pause' : 'play_arrow'}</span>
          {simRunning ? 'Pause Simulation' : 'Start Simulation'}
        </button>

        <button
          onClick={onRestart}
          disabled={!connected}
          className="btn flex items-center gap-1.5"
          style={{ opacity: connected ? 1 : 0.4, cursor: connected ? 'pointer' : 'not-allowed' }}
        >
          <span className="material-symbols-outlined text-[16px]">restart_alt</span>
          Restart
        </button>

        <button onClick={onSettingsOpen} className="icon-btn" title="Settings">
          <span className="material-symbols-outlined text-[18px]">settings</span>
        </button>
      </div>
    </header>
  )
}

// ── Agent Breakdown Bar ───────────────────────────────────────────────────────

function AgentBar({ label, score, maxScore, color }) {
  const pct = maxScore > 0 ? Math.min(100, (score / maxScore) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: '#c1c7d3' }}>{label}</span>
        <span className="font-mono text-xs tabular-nums font-semibold" style={{ color }}>{score.toFixed(0)} pts</span>
      </div>
      <div className="agent-bar-track">
        <div className="agent-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

// ── Hazard Score Panel ────────────────────────────────────────────────────────

function HazardScorePanel({ hazardData }) {
  const primaryZone = hazardData?.zones?.find(z => z.zone_id === 'zone-alpha')
  const score  = primaryZone?.score ?? 0
  const level  = primaryZone?.level ?? 'Safe'
  const bd     = primaryZone?.per_agent_breakdown ?? {}
  const color  = levelColor(level)
  const glowCls = level === 'Critical' ? 'animate-glow-critical' : level === 'High' ? 'animate-glow-high' : ''

  return (
    <div className={`card flex flex-col gap-4 animate-fade-in ${glowCls}`}
      style={{ borderColor: `${color}40`, transition: 'border-color 0.5s ease' }}
    >
      {/* Header row */}
      <div className="flex justify-between items-start">
        <div>
          <span className="section-label mb-1">Compound Hazard Score</span>
          <div className="flex items-baseline gap-2">
            <span
              className="font-semibold leading-none tabular-nums"
              style={{ fontSize: 48, color, fontFamily: 'Inter', letterSpacing: '-0.02em', transition: 'color 0.5s ease' }}
            >
              {Math.round(score)}
            </span>
            <span className="text-lg font-medium" style={{ color: '#8b919d' }}>/ 100</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 mt-1">
          <LevelBadge level={level} />
        </div>
      </div>

      {/* Score bar */}
      <div className="h-2 w-full rounded-full overflow-hidden" style={{ background: '#32353b' }}>
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${score}%`, background: color }}
        />
      </div>

      {/* Agent breakdown */}
      <div className="pt-3 space-y-2" style={{ borderTop: '1px solid #414751' }}>
        <span className="section-label mb-2">Supporting Signals — 4 Agents</span>
        <AgentBar label="Gas Agent"         score={bd.gas_agent         ?? 0} maxScore={60} color="#45dfa4" />
        <AgentBar label="Permit Agent"      score={bd.permit_agent      ?? 0} maxScore={15} color="#fabd34" />
        <AgentBar label="Worker Agent"      score={bd.worker_agent      ?? 0} maxScore={15} color="#f97316" />
        <AgentBar label="Maintenance Agent" score={bd.maintenance_agent ?? 0} maxScore={10} color="#a4c9ff" />
      </div>

      {/* Interaction bonus */}
      {(bd.interaction_bonus ?? 0) > 0 && (
        <div
          className="p-3 flex items-center gap-2.5 mt-1"
          style={{ background: 'rgba(255,180,171,0.06)', border: '1px solid rgba(255,180,171,0.20)', borderRadius: '0.25rem' }}
        >
          <span style={{ color: '#ffb4ab', fontWeight: 700 }}>⚡</span>
          <div>
            <span className="text-xs font-semibold" style={{ color: '#ffb4ab' }}>Compound Interaction Bonus</span>
            <span className="text-xs ml-1.5" style={{ color: '#8b919d' }}>+{bd.interaction_bonus} pts</span>
            <p className="text-[10px] mt-0.5" style={{ color: '#8b919d' }}>Gas &gt;75% LEL + 2+ risk factors active</p>
          </div>
        </div>
      )}

      {/* Live signals sub-grid */}
      {primaryZone?.signals && (
        <div className="grid grid-cols-2 gap-2 pt-2" style={{ borderTop: '1px solid #414751' }}>
          <div className="card-sm">
            <div className="text-[10px] mb-1" style={{ color: '#8b919d' }}>Gas Concentration</div>
            <div className="font-mono text-sm font-semibold tabular-nums text-on-surface">
              {primaryZone.signals.gas_ppm?.toFixed(1)} <span className="text-xs font-normal" style={{ color: '#8b919d' }}>ppm</span>
            </div>
            <div className="text-[10px] mt-0.5" style={{ color: '#8b919d' }}>{primaryZone.signals.gas_ratio_pct?.toFixed(1)}% of LEL</div>
          </div>
          <div className="card-sm" style={primaryZone.signals.hot_work_permit ? { borderColor: 'rgba(250,189,52,0.3)' } : {}}>
            <div className="text-[10px] mb-1" style={{ color: '#8b919d' }}>Hot-Work Permit</div>
            <div className="text-sm font-semibold" style={{ color: primaryZone.signals.hot_work_permit ? '#fabd34' : '#45dfa4' }}>
              {primaryZone.signals.hot_work_permit ? 'ACTIVE' : 'None'}
            </div>
            {primaryZone.signals.permit_id && (
              <div className="text-[10px] mt-0.5 font-mono" style={{ color: '#8b919d' }}>{primaryZone.signals.permit_id}</div>
            )}
          </div>
          <div className="card-sm" style={primaryZone.signals.confined_space_entry ? { borderColor: 'rgba(249,115,22,0.3)' } : {}}>
            <div className="text-[10px] mb-1" style={{ color: '#8b919d' }}>Confined Space</div>
            <div className="text-sm font-semibold" style={{ color: primaryZone.signals.confined_space_entry ? '#f97316' : '#45dfa4' }}>
              {primaryZone.signals.confined_space_entry ? 'OCCUPIED' : 'Clear'}
            </div>
            {primaryZone.signals.confined_space_worker && (
              <div className="text-[10px] mt-0.5" style={{ color: '#8b919d' }}>{primaryZone.signals.confined_space_worker}</div>
            )}
          </div>
          <div className="card-sm" style={primaryZone.signals.maintenance_active ? { borderColor: 'rgba(164,201,255,0.3)' } : {}}>
            <div className="text-[10px] mb-1" style={{ color: '#8b919d' }}>Maintenance</div>
            <div className="text-sm font-semibold" style={{ color: primaryZone.signals.maintenance_active ? '#a4c9ff' : '#45dfa4' }}>
              {primaryZone.signals.maintenance_active ? 'ACTIVE' : 'None'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── AI Diagnostic Panel ───────────────────────────────────────────────────────

function DiagnosticPanel({ explanation }) {
  if (!explanation || explanation.detail) {
    return (
      <div className="card flex flex-col gap-4 animate-fade-in">
        <div className="flex justify-between items-center pb-4" style={{ borderBottom: '1px solid #414751' }}>
          <span className="section-label-lg mb-0">AI Diagnostic</span>
          <span className="text-[10px] px-2 py-1" style={{ background: '#272a30', border: '1px solid #414751', borderRadius: '0.25rem', color: '#8b919d' }}>
            gemini-2.0-flash
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs animate-pulse" style={{ color: '#8b919d' }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#60a5fa', display: 'inline-block' }} />
          Waiting for hazard event…
        </div>
      </div>
    )
  }

  const isGemini = explanation.source === 'gemini'

  return (
    <div className="card flex flex-col gap-4 animate-fade-in overflow-y-auto scroll-fade">
      <div className="flex justify-between items-center pb-4" style={{ borderBottom: '1px solid #414751' }}>
        <span className="section-label-lg mb-0">AI Diagnostic</span>
        <span
          className="text-[10px] px-2 py-1"
          style={{
            background: isGemini ? 'rgba(96,165,250,0.10)' : '#272a30',
            border: `1px solid ${isGemini ? 'rgba(96,165,250,0.25)' : '#414751'}`,
            borderRadius: '0.25rem',
            color: isGemini ? '#60a5fa' : '#8b919d',
          }}
        >
          {isGemini ? 'gemini-2.0-flash' : 'fallback'}
        </span>
      </div>

      {/* Root Cause */}
      <div>
        <h4 className="section-label mb-2">Root Cause</h4>
        <p className="text-sm leading-relaxed" style={{ color: '#e1e2e9' }}>{explanation.root_cause}</p>
      </div>

      {/* Confidence */}
      <div>
        <h4 className="section-label mb-1">Confidence</h4>
        <p className="text-sm font-semibold" style={{ color: '#45dfa4' }}>{explanation.confidence}</p>
      </div>

      {/* Recommended Actions */}
      {explanation.actions?.length > 0 && (
        <div>
          <h4 className="section-label mb-2">Recommended Actions</h4>
          <ul className="space-y-2">
            {explanation.actions.map((action, i) => (
              <li key={i} className="action-item animate-slide-up" style={{ animationDelay: `${i * 0.08}s` }}>
                <div
                  className="w-5 h-5 flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.3)', color: '#60a5fa', borderRadius: '50%' }}
                >
                  {i + 1}
                </div>
                <p className="text-xs leading-relaxed" style={{ color: '#c1c7d3' }}>{action}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── Worker Tracking Panel ─────────────────────────────────────────────────────

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
      <span className="section-label">Worker Tracking</span>
      {allWorkers.length === 0 ? (
        <p className="text-xs" style={{ color: '#8b919d' }}>No workers tracked.</p>
      ) : (
        <div className="space-y-2 max-h-52 overflow-y-auto pr-1 scroll-fade">
          {allWorkers.map(w => {
            const zColor = levelColor(w.zone_level)
            const initials = w.name?.split(' ').map(n => n[0]).join('').slice(0,2) ?? '??'
            return (
              <div
                key={w.id}
                className="flex items-center gap-3 p-3"
                style={{ background: '#272a30', border: '1px solid #414751', borderRadius: '0.25rem' }}
              >
                <div
                  className="w-8 h-8 flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ background: '#32353b', color: '#e1e2e9', borderRadius: '50%' }}
                >
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold truncate" style={{ color: '#e1e2e9' }}>{w.name}</span>
                    {w.in_confined_space && (
                      <span className="text-[9px] font-bold px-1" style={{ color: '#f97316', background: 'rgba(249,115,22,0.10)', border: '1px solid rgba(249,115,22,0.25)', borderRadius: '2px' }}>CS</span>
                    )}
                    {w.in_maintenance && (
                      <span className="text-[9px] font-bold px-1" style={{ color: '#a4c9ff', background: 'rgba(164,201,255,0.10)', border: '1px solid rgba(164,201,255,0.25)', borderRadius: '2px' }}>MNT</span>
                    )}
                  </div>
                  <div className="text-[10px] mt-0.5 truncate" style={{ color: '#8b919d' }}>{w.role}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[10px] font-semibold" style={{ color: zColor }}>{w.zone_id}</div>
                  <div className="text-[9px] uppercase mt-0.5" style={{ color: '#8b919d' }}>PPE: Active</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Similar Incident Panel ────────────────────────────────────────────────────

function IncidentPanel({ incidentData }) {
  const match = incidentData?.match
  const activeTags = incidentData?.active_tags ?? []

  const tagColor = t => ({
    gas:            '#45dfa4',
    hot_work:       '#fabd34',
    confined_space: '#f97316',
    maintenance:    '#a4c9ff',
  }[t] ?? '#8b919d')

  const tagLabel = t => ({
    gas:            'Gas',
    hot_work:       'Hot-Work',
    confined_space: 'Confined Space',
    maintenance:    'Maintenance',
  }[t] ?? t)

  const sevColor = s => ({
    Critical: '#ffb4ab', High: '#f97316', Elevated: '#fabd34', Safe: '#45dfa4',
  }[s] ?? '#8b919d')

  return (
    <div className="card animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <span className="section-label mb-0">Similar Past Incident</span>
        <div className="flex items-center gap-1.5">
          {activeTags.length > 0 && (
            <div className="flex gap-1">
              {activeTags.map(t => (
                <span key={t}
                  className="text-[9px] font-bold px-1.5 py-0.5 tag-pill"
                  style={{ color: tagColor(t), background: `${tagColor(t)}15`, border: `1px solid ${tagColor(t)}35`, borderRadius: '2px' }}
                >
                  {tagLabel(t)}
                </span>
              ))}
            </div>
          )}
          <span className="pill">RAG · tag-overlap</span>
        </div>
      </div>

      {!incidentData && (
        <p className="text-xs animate-pulse" style={{ color: '#8b919d' }}>Waiting for first match…</p>
      )}

      {incidentData && !match && (
        <div className="text-center py-4">
          <span className="material-symbols-outlined text-2xl mb-1" style={{ color: '#8b919d', display: 'block' }}>task_alt</span>
          <p className="text-xs" style={{ color: '#8b919d' }}>No matching incident</p>
          <p className="text-[10px] mt-1" style={{ color: '#8b919d' }}>Active tag overlap score: 0</p>
        </div>
      )}

      {match && (
        <div className="space-y-2.5">
          <div className="p-3" style={{ background: '#272a30', border: '1px solid #414751', borderRadius: '0.25rem' }}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <p className="text-xs font-semibold flex-1" style={{ color: '#e1e2e9' }}>{match.title}</p>
              <span
                className="text-[10px] font-bold px-2 py-0.5 shrink-0"
                style={{ color: sevColor(match.severity), background: `${sevColor(match.severity)}15`, border: `1px solid ${sevColor(match.severity)}35`, borderRadius: '2px' }}
              >
                {match.severity}
              </span>
            </div>

            <div className="flex items-center gap-2 text-[10px] mb-2" style={{ color: '#8b919d' }}>
              <span>{match.id}</span>
              <span>·</span>
              <span>{match.date}</span>
              <span>·</span>
              <span className="font-semibold font-mono" style={{ color: '#a4c9ff' }}>{match.similarity_pct}% match</span>
            </div>

            {match.matching_tags?.length > 0 && (
              <div className="flex gap-1 flex-wrap mb-2">
                {match.matching_tags.map(t => (
                  <span key={t}
                    className="text-[9px] font-bold px-1.5 py-0.5"
                    style={{ color: tagColor(t), background: `${tagColor(t)}15`, border: `1px solid ${tagColor(t)}35`, borderRadius: '2px' }}
                  >
                    ✓ {tagLabel(t)}
                  </span>
                ))}
              </div>
            )}

            <p className="text-[11px] leading-relaxed line-clamp-3" style={{ color: '#c1c7d3' }}>{match.summary}</p>
          </div>

          <div className="p-3" style={{ background: '#1d2025', border: '1px solid #414751', borderRadius: '0.25rem' }}>
            <p className="text-[9px] font-semibold uppercase tracking-wide mb-1" style={{ color: '#8b919d' }}>Historical Root Cause</p>
            <p className="text-[11px] leading-snug" style={{ color: '#c1c7d3' }}>{match.root_cause}</p>
          </div>

          {match.source_note && (
            <p className="text-[9px] italic" style={{ color: '#8b919d' }}>{match.source_note}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Active Permits Panel ──────────────────────────────────────────────────────

function PermitPanel({ plantState }) {
  const allPermits = []
  for (const zone of plantState?.zones ?? []) {
    for (const permit of zone.active_permits ?? []) {
      allPermits.push({ ...permit, zone_id: zone.id, zone_name: zone.name, gas_ppm: zone.gas_ppm, gas_threshold: zone.gas_threshold })
    }
  }

  return (
    <div className="card animate-fade-in">
      <span className="section-label">Active Permits</span>
      {allPermits.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center p-4 text-center"
          style={{ background: '#272a30', border: '1px solid #414751', borderRadius: '0.25rem', minHeight: '80px' }}
        >
          <span className="material-symbols-outlined mb-1" style={{ color: '#8b919d' }}>task_alt</span>
          <span className="text-sm" style={{ color: '#8b919d' }}>No active permits.</span>
        </div>
      ) : (
        <div className="space-y-2">
          {allPermits.map(permit => {
            const gasPct = permit.gas_ppm && permit.gas_threshold ? (permit.gas_ppm / permit.gas_threshold) * 100 : 0
            const isConflicting = gasPct > 75
            return (
              <div
                key={permit.id}
                className="p-3 text-xs"
                style={{
                  background: isConflicting ? 'rgba(255,180,171,0.06)' : '#272a30',
                  border: `1px solid ${isConflicting ? 'rgba(255,180,171,0.25)' : '#414751'}`,
                  borderRadius: '0.25rem',
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold font-mono" style={{ color: '#e1e2e9' }}>{permit.id}</span>
                  {isConflicting && <span className="text-[9px] font-bold" style={{ color: '#ffb4ab' }}>⚠ CONFLICT</span>}
                </div>
                <div style={{ color: '#8b919d' }}>{permit.type?.replace('_', ' ')} · {permit.zone_id}</div>
                {permit.description && <div className="mt-0.5" style={{ color: '#c1c7d3' }}>{permit.description}</div>}
                {isConflicting && (
                  <div className="mt-1.5 text-[10px]" style={{ color: '#ffb4ab' }}>
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

// ── Incident Report Modal ─────────────────────────────────────────────────────

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
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="relative w-full max-w-3xl flex flex-col modal-enter"
        style={{
          background: '#1d2025',
          border: `1px solid ${levelCol}40`,
          borderRadius: '0.5rem',
          maxHeight: '85vh',
        }}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0" style={{ borderBottom: '1px solid #414751' }}>
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 flex items-center justify-center text-sm"
              style={{ background: `${levelCol}18`, border: `1px solid ${levelCol}40`, borderRadius: '0.25rem' }}
            >
              📋
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: '#e1e2e9' }}>Incident Report</p>
              <p className="text-[11px] mt-0.5" style={{ color: '#8b919d' }}>
                FusionIQ · Zone Alpha · Score {score?.toFixed(0)}/100 · {level}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="btn flex items-center gap-1.5"
              style={{ color: levelCol, borderColor: `${levelCol}40`, background: `${levelCol}0d` }}
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              Download .txt
            </button>
            <button onClick={onClose} className="icon-btn">✕</button>
          </div>
        </div>

        {/* Report body */}
        <div className="flex-1 overflow-y-auto p-6">
          <pre
            className="text-[11px] leading-relaxed whitespace-pre-wrap"
            style={{ color: '#c1c7d3', fontFamily: 'JetBrains Mono, Fira Code, monospace' }}
          >
            {report}
          </pre>
        </div>

        {/* Footer disclaimer */}
        <div className="px-6 py-3 shrink-0" style={{ borderTop: '1px solid #414751' }}>
          <p className="text-[10px]" style={{ color: '#8b919d' }}>
            ⚠ Prototype report generated from simulated data. Compliance references are generic — verify against your plant's safety management system before formal submission.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [lastPoll, setLastPoll]         = useState(null)
  const [reportModal, setReportModal]   = useState(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [backendUrl, setBackendUrl]     = useState(() => {
    const saved = localStorage.getItem('FUSIONIQ_BACKEND_URL')
    const envUrl = import.meta.env.VITE_API_URL
    if (saved && saved !== 'http://localhost:8000') return saved
    return envUrl || saved || 'http://localhost:8000'
  })

  // ── Polling hooks — unchanged from original ───────────────────────
  const { data: plantState,  error: plantError  } = usePoll(`${backendUrl}/plant-state`,        2000)
  const { data: hazardData,  error: hazardError  } = usePoll(`${backendUrl}/hazard-score`,       2000)
  const { data: explanation                      } = usePoll(`${backendUrl}/hazard-explanation`, 4000)
  const { data: incidentData                     } = usePoll(`${backendUrl}/similar-incident`,   6000)

  useEffect(() => {
    if (plantState || hazardData) setLastPoll(new Date().toLocaleTimeString())
  }, [plantState, hazardData])

  const connected    = !plantError && !hazardError && !!plantState
  const primaryZone  = hazardData?.zones?.find(z => z.zone_id === 'zone-alpha')
  const primaryLevel = primaryZone?.level ?? 'Safe'

  // ── Event handlers — unchanged from original ──────────────────────
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
      const resReset = await fetch(`${backendUrl}/simulator/reset`, { method: 'POST' })
      if (!resReset.ok) throw new Error(`HTTP Reset ${resReset.status}`)
      const resStart = await fetch(`${backendUrl}/simulator/start`, { method: 'POST' })
      if (!resStart.ok) throw new Error(`HTTP Start ${resStart.status}`)
    } catch (err) {
      alert(`Failed to restart simulation: ${err.message}`)
    }
  }

  // ── Heatmap zone merge — unchanged from original ──────────────────
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
    <div className="min-h-screen flex flex-col" style={{ background: '#101419' }}>

      {/* ── Header ───────────────────────────────────────────────────── */}
      <Header
        connected={connected}
        lastPoll={lastPoll}
        primaryLevel={primaryLevel}
        simRunning={plantState?.simulator_running}
        onSettingsOpen={() => setSettingsOpen(true)}
        onStartPause={handleToggleStartPause}
        onRestart={handleRestart}
        elapsedSeconds={plantState?.simulator_elapsed_seconds}
        backendUrl={backendUrl}
      />

      {/* ── Main Content Canvas ───────────────────────────────────────── */}
      <main className="flex-grow p-8 flex flex-col gap-5 overflow-auto">

        {/* ── Row 1: Heatmap (left) + Compound Hazard Score (right) ──────── */}
        <div className="grid grid-cols-12 gap-5 items-start">
          <section className="col-span-12 lg:col-span-7">
            {/* HeatmapGrid — existing component; it renders its own title + card,
                so no extra wrapper/title is added here (avoids duplicate heading
                and the empty space a second nested card would introduce). */}
            <HeatmapGrid zones={heatmapZones} />
          </section>

          <section className="col-span-12 lg:col-span-5">
            <HazardScorePanel hazardData={hazardData} />
          </section>
        </div>

        {/* ── Row 2: Worker/Incident/Permits (left) + AI Diagnostic (right) ── */}
        <div className="grid grid-cols-12 gap-5 items-start">
          <div className="col-span-12 lg:col-span-7 grid grid-cols-1 md:grid-cols-3 gap-4">
            <WorkerPanel plantState={plantState} />
            <IncidentPanel incidentData={incidentData} />
            <PermitPanel plantState={plantState} />
          </div>

          <section className="col-span-12 lg:col-span-5">
            <DiagnosticPanel explanation={explanation} />
          </section>
        </div>

        {/* ── Row 3: Knowledge Graph (full width) ──────────────────────── */}
        {/* Layout only: given the full dashboard width and a taller canvas
            (see KnowledgeGraph.jsx). Nodes, edges, fetch/poll logic, and
            React Flow config are unchanged. */}
        <KnowledgeGraph currentLevel={primaryLevel} backendUrl={backendUrl} />

      </main>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer
        className="flex flex-col md:flex-row justify-between items-center px-8 py-4 w-full shrink-0 mt-auto"
        style={{ background: '#191c21', borderTop: '1px solid #414751' }}
      >
        <div className="flex items-center gap-4">
          <span className="text-xs uppercase tracking-widest" style={{ color: '#8b919d' }}>
            FusionIQ Operational Intelligence
          </span>
          <span className="text-xs" style={{ color: '#414751' }}>//</span>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#45dfa4', display: 'inline-block' }} />
            <span className="text-xs" style={{ color: '#45dfa4' }}>System Secure</span>
          </div>
          {lastPoll && (
            <span className="text-[10px]" style={{ color: '#8b919d' }}>· Last poll: {lastPoll}</span>
          )}
        </div>

        <div className="flex items-center gap-4">
          <button className="text-xs uppercase tracking-widest transition-colors" style={{ color: '#8b919d' }}
            onMouseEnter={e => e.target.style.color = '#45dfa4'}
            onMouseLeave={e => e.target.style.color = '#8b919d'}
          >
            Audit Logs
          </button>
          <div style={{ width: '1px', height: '1rem', background: '#414751' }} />
          <button
            onClick={handleGenerateReport}
            disabled={reportLoading}
            className="flex items-center gap-2 px-4 py-2 text-sm transition-colors"
            style={{
              background: '#272a30',
              border: '1px solid #414751',
              borderRadius: '0.25rem',
              color: levelColor(primaryLevel),
              cursor: reportLoading ? 'not-allowed' : 'pointer',
              opacity: reportLoading ? 0.6 : 1,
            }}
            onMouseEnter={e => !reportLoading && (e.currentTarget.style.background = '#32353b')}
            onMouseLeave={e => (e.currentTarget.style.background = '#272a30')}
          >
            <span className="material-symbols-outlined text-[18px]">assignment</span>
            {reportLoading ? 'Generating…' : 'Generate Report'}
          </button>
        </div>
      </footer>

      {/* ── Modals ────────────────────────────────────────────────────── */}
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
