import { useEffect, useState } from 'react'

const BACKEND_URL = 'http://localhost:8000'

// ─── Status indicator dot ────────────────────────────────────────────────────
function StatusDot({ status }) {
  const colors = {
    connected:    'bg-safe animate-pulse-slow',
    connecting:   'bg-elevated animate-pulse',
    disconnected: 'bg-critical',
  }
  return (
    <span
      className={`status-dot ${colors[status] ?? 'bg-surface-muted'}`}
      aria-hidden="true"
    />
  )
}

// ─── API Response Card ───────────────────────────────────────────────────────
function ApiResponseCard({ data, error, loading }) {
  if (loading) {
    return (
      <div className="card animate-pulse space-y-2">
        <div className="h-4 bg-surface-border rounded w-1/4" />
        <div className="h-3 bg-surface-border rounded w-3/4" />
        <div className="h-3 bg-surface-border rounded w-1/2" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="card border-critical/40 bg-critical/5 animate-fade-in">
        <p className="text-xs font-mono text-surface-muted mb-1">GET /health</p>
        <p className="text-critical font-semibold text-sm">Connection failed</p>
        <p className="text-surface-muted text-xs mt-1">{error}</p>
        <p className="text-surface-muted text-xs mt-3">
          Make sure the backend is running:{' '}
          <code className="font-mono text-elevated">
            uvicorn app.main:app --reload
          </code>
        </p>
      </div>
    )
  }

  return (
    <div className="card border-safe/40 bg-safe/5 animate-fade-in">
      <p className="text-xs font-mono text-surface-muted mb-2">GET /health → 200 OK</p>
      <pre className="text-sm font-mono text-safe whitespace-pre-wrap break-all">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  )
}

// ─── Checklist item ──────────────────────────────────────────────────────────
function CheckItem({ done, label }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <span className={done ? 'text-safe' : 'text-surface-muted'}>
        {done ? '✓' : '○'}
      </span>
      <span className={done ? 'text-slate-200' : 'text-surface-muted'}>{label}</span>
    </li>
  )
}

// ─── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const [health, setHealth]       = useState(null)
  const [error, setError]         = useState(null)
  const [loading, setLoading]     = useState(true)
  const [lastPoll, setLastPoll]   = useState(null)
  const [pollCount, setPollCount] = useState(0)

  const fetchHealth = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/health`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setHealth(json)
      setError(null)
      setLastPoll(new Date().toLocaleTimeString())
      setPollCount(n => n + 1)
    } catch (err) {
      setError(err.message)
      setHealth(null)
      setLastPoll(new Date().toLocaleTimeString())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHealth()
    const interval = setInterval(fetchHealth, 5000)
    return () => clearInterval(interval)
  }, [])

  const connected = !!health && !error
  const connectionStatus = loading ? 'connecting' : connected ? 'connected' : 'disconnected'

  return (
    <div className="min-h-screen bg-surface flex flex-col">

      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <header className="border-b border-surface-border bg-surface-card/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Logo mark */}
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <span className="text-white font-bold text-xs">FQ</span>
            </div>
            <div>
              <h1 className="text-sm font-semibold text-white leading-none">FusionIQ</h1>
              <p className="text-xs text-surface-muted leading-none mt-0.5">Industrial Decision Intelligence</p>
            </div>
          </div>

          {/* Connection pill */}
          <div className="flex items-center gap-1.5 bg-surface border border-surface-border rounded-full px-3 py-1.5">
            <StatusDot status={connectionStatus} />
            <span className="text-xs font-medium text-slate-300">
              {connectionStatus === 'connecting' ? 'Connecting…'
               : connectionStatus === 'connected'    ? 'Backend connected'
               : 'Backend offline'}
            </span>
            {lastPoll && (
              <span className="text-xs text-surface-muted ml-1">· {lastPoll}</span>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-10 space-y-8">

        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 rounded-full px-3 py-1 animate-fade-in">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          <span className="text-xs font-medium text-blue-300">Day 2 — End-to-end skeleton</span>
        </div>

        {/* Headline */}
        <div className="space-y-2 animate-slide-up">
          <h2 className="text-4xl font-bold text-white tracking-tight">
            Compound Hazard{' '}
            <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              Detection
            </span>
          </h2>
          <p className="text-surface-muted text-lg max-w-2xl">
            FusionIQ correlates gas readings, work permits, worker locations,
            and maintenance activity to detect compound industrial hazards{' '}
            <em>before they become accidents</em>.
          </p>
        </div>

        {/* Two-column grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-slide-up">

          {/* Left — API health */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                Backend health check
              </h3>
              {pollCount > 0 && (
                <span className="text-xs text-surface-muted">
                  Poll #{pollCount}
                </span>
              )}
            </div>
            <ApiResponseCard data={health} error={error} loading={loading} />
            <p className="text-xs text-surface-muted">
              Polls every 5 s · backend at{' '}
              <code className="font-mono text-slate-400">{BACKEND_URL}</code>
            </p>
          </div>

          {/* Right — Day checklist */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
              Day 2 checklist
            </h3>
            <div className="card space-y-4">
              <div>
                <p className="text-xs text-surface-muted font-semibold uppercase mb-2">Backend</p>
                <ul className="space-y-1.5">
                  <CheckItem done label="FastAPI app created" />
                  <CheckItem done label="SQLAlchemy + SQLite wired up" />
                  <CheckItem done label="Tables created on startup" />
                  <CheckItem done label="CORS → localhost:5173 enabled" />
                  <CheckItem done={connected} label="GET /health returning 200" />
                  <CheckItem done={connected} label="/docs (Swagger UI) accessible" />
                </ul>
              </div>
              <div className="border-t border-surface-border pt-3">
                <p className="text-xs text-surface-muted font-semibold uppercase mb-2">Frontend</p>
                <ul className="space-y-1.5">
                  <CheckItem done label="Vite + React scaffold" />
                  <CheckItem done label="Tailwind CSS configured" />
                  <CheckItem done label="reactflow installed (Day 7 ready)" />
                  <CheckItem done={connected} label="Live data from backend rendered" />
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Pipeline preview strip */}
        <div className="animate-slide-up">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">
            Build pipeline
          </h3>
          <div className="card overflow-x-auto">
            <div className="flex items-center gap-0 min-w-max text-xs">
              {[
                { day: 1, label: 'Scenario\n& Schema',  done: true },
                { day: 2, label: 'Stack\nSkeleton',     done: true, active: true },
                { day: 3, label: 'Data\nSimulator',     done: false },
                { day: 4, label: 'Hazard\nEngine',      done: false },
                { day: 5, label: 'Gemini\nExplain',     done: false },
                { day: 6, label: 'Dashboard\n+ Heatmap',done: false },
                { day: 7, label: 'KG\nPanel',           done: false },
                { day: 8, label: 'RAG +\nReport',       done: false },
                { day: 9, label: 'Polish\n& Docs',      done: false },
                { day: 10, label: 'Record\n& Submit',   done: false },
              ].map((step, i, arr) => (
                <div key={step.day} className="flex items-center">
                  <div className={`flex flex-col items-center px-3 py-2 rounded-lg transition-colors ${
                    step.active ? 'bg-blue-500/20 border border-blue-500/50' :
                    step.done   ? 'bg-safe/10 border border-safe/30' :
                    'border border-surface-border'
                  }`}>
                    <span className={`font-bold text-sm ${
                      step.active ? 'text-blue-400' :
                      step.done   ? 'text-safe' :
                      'text-surface-muted'
                    }`}>D{step.day}</span>
                    <span className={`text-center whitespace-pre-line mt-0.5 leading-tight ${
                      step.active ? 'text-blue-300' :
                      step.done   ? 'text-slate-300' :
                      'text-surface-muted'
                    }`}>{step.label}</span>
                  </div>
                  {i < arr.length - 1 && (
                    <div className={`w-4 h-px mx-0.5 ${step.done ? 'bg-safe/50' : 'bg-surface-border'}`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Quick-start commands */}
        <div className="animate-slide-up">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">
            Quick start
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
            <div className="card border-surface-border space-y-2">
              <p className="text-surface-muted font-sans font-semibold text-xs uppercase">Backend</p>
              <p className="text-slate-400"># from project root</p>
              <p className="text-safe">cd backend</p>
              <p className="text-safe">pip install -r requirements.txt</p>
              <p className="text-safe">uvicorn app.main:app --reload</p>
            </div>
            <div className="card border-surface-border space-y-2">
              <p className="text-surface-muted font-sans font-semibold text-xs uppercase">Frontend</p>
              <p className="text-slate-400"># from project root</p>
              <p className="text-safe">cd frontend</p>
              <p className="text-safe">npm install</p>
              <p className="text-safe">npm run dev</p>
            </div>
          </div>
        </div>

      </main>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="border-t border-surface-border py-4 text-center">
        <p className="text-xs text-surface-muted">
          FusionIQ · ET AI Hackathon 2026 · Day 2 build complete
        </p>
      </footer>

    </div>
  )
}
