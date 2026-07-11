/**
 * KnowledgeGraph.jsx — React Flow knowledge graph panel (Day 7)
 *
 * Renders a live node/edge graph of Zone → Permit → Risk relationships.
 * Polls /knowledge-graph/zone-alpha every 3 seconds.
 *
 * Fix: ALL node components and nodeTypes/edgeTypes are defined at MODULE SCOPE
 * (outside every React component). This is mandatory for React Flow — creating
 * the nodeTypes object inside a component causes infinite re-renders.
 * See: https://reactflow.dev/error#002
 *
 * The Vite resolve.dedupe config ensures reactflow shares the same React
 * instance as the app, so static imports work correctly.
 */

import React, { useCallback, useEffect, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MiniMap,
  Position,
  getBezierPath,
} from 'reactflow'
import 'reactflow/dist/style.css'

const BACKEND_URL = 'http://localhost:8000'

// ── Design tokens ─────────────────────────────────────────────────────────────

const LEVEL_COLOR = {
  Safe:     { bg: '#0f2e1a', border: '#22c55e', text: '#22c55e' },
  Elevated: { bg: '#2a2000', border: '#eab308', text: '#eab308' },
  High:     { bg: '#2a1200', border: '#f97316', text: '#f97316' },
  Critical: { bg: '#2a0000', border: '#ef4444', text: '#ef4444' },
}

// ── Node components — defined at MODULE SCOPE (never inside a render fn) ──────

const ZoneNode = React.memo(({ data }) => (
  <div style={{
    background: '#0d1f3c', border: '2px solid #3b82f6', borderRadius: 10,
    padding: '10px 14px', minWidth: 140,
    boxShadow: '0 0 12px rgba(59,130,246,0.3)',
  }}>
    <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
    <div style={{ fontSize: 9, color: '#60a5fa', fontWeight: 700, letterSpacing: 1, marginBottom: 4, textTransform: 'uppercase' }}>Zone</div>
    <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600 }}>{data.label}</div>
    {data.hazard_class && (
      <div style={{ fontSize: 9, color: '#3b82f6', marginTop: 2 }}>{data.hazard_class}</div>
    )}
    <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
  </div>
))

const SensorNode = React.memo(({ data }) => {
  const pct = data.score ? Math.min(100, Math.round((data.score / 60) * 100)) : 0
  return (
    <div style={{ background: '#0a2020', border: '1.5px solid #14b8a6', borderRadius: 8, padding: '8px 12px', minWidth: 120 }}>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <div style={{ fontSize: 9, color: '#14b8a6', fontWeight: 700, letterSpacing: 1, marginBottom: 3, textTransform: 'uppercase' }}>Gas Sensor</div>
      <div style={{ fontSize: 11, color: '#e2e8f0', fontWeight: 600, whiteSpace: 'pre-line' }}>{data.label}</div>
      <div style={{ marginTop: 5, height: 3, background: '#1e3535', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: '#14b8a6', transition: 'width 0.7s ease' }} />
      </div>
    </div>
  )
})

const PermitNode = React.memo(({ data }) => (
  <div style={{ background: '#1a1500', border: '1.5px solid #eab308', borderRadius: 8, padding: '8px 12px', minWidth: 130 }}>
    <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    <div style={{ fontSize: 9, color: '#eab308', fontWeight: 700, letterSpacing: 1, marginBottom: 3, textTransform: 'uppercase' }}>Hot-Work Permit</div>
    <div style={{ fontSize: 11, color: '#e2e8f0', fontWeight: 600, whiteSpace: 'pre-line' }}>{data.label}</div>
  </div>
))

const WorkerNode = React.memo(({ data }) => (
  <div style={{ background: '#1a0d00', border: '1.5px solid #f97316', borderRadius: 8, padding: '8px 12px', minWidth: 130 }}>
    <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    <div style={{ fontSize: 9, color: '#f97316', fontWeight: 700, letterSpacing: 1, marginBottom: 3, textTransform: 'uppercase' }}>Confined Space</div>
    <div style={{ fontSize: 11, color: '#e2e8f0', fontWeight: 600, whiteSpace: 'pre-line' }}>{data.label}</div>
  </div>
))

const MaintNode = React.memo(({ data }) => (
  <div style={{ background: '#120a1a', border: '1.5px solid #a855f7', borderRadius: 8, padding: '8px 12px', minWidth: 130 }}>
    <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    <div style={{ fontSize: 9, color: '#a855f7', fontWeight: 700, letterSpacing: 1, marginBottom: 3, textTransform: 'uppercase' }}>Maintenance</div>
    <div style={{ fontSize: 11, color: '#e2e8f0', fontWeight: 600, whiteSpace: 'pre-line' }}>{data.label}</div>
  </div>
))

const RiskNode = React.memo(({ data }) => {
  const c = LEVEL_COLOR[data.level] ?? LEVEL_COLOR.Safe
  const isCritical = data.level === 'Critical'
  return (
    <div style={{
      background: c.bg, border: `2px solid ${c.border}`, borderRadius: 12,
      padding: '12px 18px', minWidth: 160, textAlign: 'center',
      boxShadow: isCritical ? `0 0 20px ${c.border}55` : 'none',
      transition: 'box-shadow 0.5s ease',
    }}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div style={{ fontSize: 9, color: c.text, fontWeight: 700, letterSpacing: 1, marginBottom: 4, textTransform: 'uppercase' }}>Compound Risk</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: c.text, fontFamily: 'JetBrains Mono, monospace' }}>
        {data.score ?? '--'}
      </div>
      <div style={{ fontSize: 13, color: c.text, fontWeight: 700, marginTop: 2 }}>{data.level ?? 'Safe'}</div>
    </div>
  )
})

// Custom edge with label
const LabeledEdge = ({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, data, markerEnd, style,
}) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
  })
  return (
    <>
      <path id={id} className="react-flow__edge-path" d={edgePath} markerEnd={markerEnd} style={style} />
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              fontSize: 9, fontWeight: 700,
              background: '#161b27', color: style?.stroke ?? '#8892a4',
              padding: '1px 5px', borderRadius: 4,
              border: `1px solid ${style?.stroke ?? '#1e2535'}44`,
              pointerEvents: 'none', whiteSpace: 'nowrap',
            }}
            className="nodrag nopan"
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

// ── Module-scope type maps (stable object references — never recreated) ────────

const NODE_TYPES = {
  zoneNode:   ZoneNode,
  sensorNode: SensorNode,
  permitNode: PermitNode,
  workerNode: WorkerNode,
  maintNode:  MaintNode,
  riskNode:   RiskNode,
}

const EDGE_TYPES = {
  labeled: LabeledEdge,
}

// ── Default placeholder (shown before first API response) ─────────────────────

const DEFAULT_NODES = [
  { id: 'zone', type: 'zoneNode',   data: { label: 'Zone Alpha\nCompressor Hall', hazard_class: 'HIGH_RISK' }, position: { x: 180, y: 100 } },
  { id: 'gas',  type: 'sensorNode', data: { label: 'Gas Sensor\n-- ppm', score: 0 },                          position: { x: 20,  y: -20 } },
  { id: 'risk', type: 'riskNode',   data: { score: '--', level: 'Safe' },                                      position: { x: 160, y: 250 } },
]
const DEFAULT_EDGES = [
  { id: 'e-gas-zone',  source: 'gas',  target: 'zone', type: 'smoothstep', style: { stroke: '#14b8a6', strokeWidth: 1.5 } },
  { id: 'e-zone-risk', source: 'zone', target: 'risk', type: 'smoothstep', style: { stroke: '#3b82f6', strokeWidth: 1.5 } },
]

// ── Main component ────────────────────────────────────────────────────────────

export default function KnowledgeGraph({ currentLevel = 'Safe' }) {
  const [nodes, setNodes] = useState(DEFAULT_NODES)
  const [edges, setEdges] = useState(DEFAULT_EDGES)
  const [status, setStatus] = useState('loading') // 'loading' | 'ok' | 'error'

  const fetchGraph = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/knowledge-graph/zone-alpha`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()

      const rfNodes = (data.nodes ?? []).map(n => ({
        id:       n.id,
        type:     n.type ?? 'default',
        data:     n.data ?? {},
        position: n.position ?? { x: 0, y: 0 },
        draggable: true,
      }))

      const rfEdges = (data.edges ?? []).map(e => ({
        id:       e.id,
        source:   e.source,
        target:   e.target,
        type:     e.label ? 'labeled' : 'smoothstep',
        animated: e.animated ?? false,
        data:     { label: e.label ?? '' },
        style: {
          stroke:      e.style?.stroke ?? '#3b82f6',
          strokeWidth: e.style?.strokeWidth ?? 1.5,
        },
        markerEnd: { type: 'arrowclosed', color: e.style?.stroke ?? '#3b82f6' },
      }))

      if (rfNodes.length) setNodes(rfNodes)
      if (rfEdges.length) setEdges(rfEdges)
      setStatus('ok')
    } catch {
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    fetchGraph()
    const id = setInterval(fetchGraph, 3000)
    return () => clearInterval(id)
  }, [fetchGraph])

  const colors = LEVEL_COLOR[currentLevel] ?? LEVEL_COLOR.Safe

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <p className="section-label mb-0">Knowledge Graph</p>
        <div className="flex items-center gap-2">
          {status === 'loading' && (
            <span className="text-[10px] text-surface-muted animate-pulse">Connecting…</span>
          )}
          {status === 'error' && (
            <span className="text-[10px] text-critical/70">⚠ Backend unavailable</span>
          )}
          {status === 'ok' && (
            <span className="text-[10px] text-safe/70">● Live</span>
          )}
          <span className="text-[9px] text-surface-muted bg-surface-border/40 rounded px-1.5 py-0.5 border border-surface-border">
            React Flow
          </span>
        </div>
      </div>

      {/* Graph canvas */}
      <div
        className="card p-0 overflow-hidden"
        style={{
          height: 300,
          borderColor: `${colors.border}33`,
          transition: 'border-color 0.5s ease',
        }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          proOptions={{ hideAttribution: true }}
          minZoom={0.3}
          maxZoom={2}
          nodesConnectable={false}
          nodesDraggable
        >
          <Background color="#1e2535" gap={20} size={0.8} />
          <Controls
            showInteractive={false}
            style={{ background: '#161b27', border: '1px solid #1e2535', borderRadius: 8 }}
          />
          <MiniMap
            nodeColor={n => ({
              riskNode:   colors.border,
              zoneNode:   '#3b82f6',
              sensorNode: '#14b8a6',
              permitNode: '#eab308',
              workerNode: '#f97316',
              maintNode:  '#a855f7',
            }[n.type] ?? '#1e2535')}
            maskColor="rgba(15,17,23,0.7)"
            style={{ background: '#0f1117', border: '1px solid #1e2535' }}
          />
        </ReactFlow>
      </div>

      <p className="text-[10px] text-surface-muted mt-2 px-1">
        Zone Alpha → Permit → Risk relationships · live via{' '}
        <code className="font-mono">/knowledge-graph/zone-alpha</code> · updates every 3 s
      </p>
    </div>
  )
}
