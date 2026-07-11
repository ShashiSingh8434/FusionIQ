/**
 * KnowledgeGraph.jsx — React Flow knowledge graph panel (Day 7)
 *
 * Renders a live node/edge graph of Zone → Permit → Risk relationships for
 * the currently active hazard in Zone Alpha.  Data is fetched from the
 * /knowledge-graph/zone-alpha endpoint every 3 seconds.
 *
 * Node types
 * ----------
 * zoneNode    — the physical zone (blue)
 * sensorNode  — gas sensor reading (teal)
 * permitNode  — active hot-work permit (yellow)
 * workerNode  — confined-space worker (orange)
 * maintNode   — maintenance activity (purple)
 * riskNode    — compound risk output (level-colored)
 *
 * This satisfies the "Knowledge Graph" bullet in the brief using reactflow
 * (already installed Day 2) with no Neo4j required.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MiniMap,
  Position,
  getBezierPath,
  useEdgesState,
  useNodesState,
} from 'reactflow'
import 'reactflow/dist/style.css'

const BACKEND_URL = 'http://localhost:8000'

// ── Level colors ─────────────────────────────────────────────────────────────
const LEVEL_COLOR = {
  Safe:     { bg: '#0f2e1a', border: '#22c55e', text: '#22c55e' },
  Elevated: { bg: '#2a2000', border: '#eab308', text: '#eab308' },
  High:     { bg: '#2a1200', border: '#f97316', text: '#f97316' },
  Critical: { bg: '#2a0000', border: '#ef4444', text: '#ef4444' },
}

// ── Custom node components ────────────────────────────────────────────────────

function ZoneNode({ data }) {
  return (
    <div style={{
      background: '#0d1f3c', border: '2px solid #3b82f6', borderRadius: 10,
      padding: '10px 14px', minWidth: 130, boxShadow: '0 0 12px rgba(59,130,246,0.3)',
    }}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div style={{ fontSize: 9, color: '#60a5fa', fontWeight: 700, letterSpacing: 1, marginBottom: 4, textTransform: 'uppercase' }}>Zone</div>
      <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600 }}>{data.label}</div>
      {data.hazard_class && (
        <div style={{ fontSize: 9, color: '#3b82f6', marginTop: 2 }}>{data.hazard_class}</div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}

function SensorNode({ data }) {
  const pct = data.score ? Math.round((data.score / 60) * 100) : 0
  return (
    <div style={{
      background: '#0a2020', border: '1.5px solid #14b8a6', borderRadius: 8,
      padding: '8px 12px', minWidth: 110,
    }}>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <div style={{ fontSize: 9, color: '#14b8a6', fontWeight: 700, letterSpacing: 1, marginBottom: 3, textTransform: 'uppercase' }}>Gas Sensor</div>
      <div style={{ fontSize: 11, color: '#e2e8f0', fontWeight: 600, whiteSpace: 'pre-line' }}>{data.label}</div>
      <div style={{ marginTop: 4, height: 3, background: '#1e3535', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: '#14b8a6', transition: 'width 0.7s ease' }} />
      </div>
    </div>
  )
}

function PermitNode({ data }) {
  return (
    <div style={{
      background: '#1a1500', border: '1.5px solid #eab308', borderRadius: 8,
      padding: '8px 12px', minWidth: 120,
    }}>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <div style={{ fontSize: 9, color: '#eab308', fontWeight: 700, letterSpacing: 1, marginBottom: 3, textTransform: 'uppercase' }}>Hot-Work Permit</div>
      <div style={{ fontSize: 11, color: '#e2e8f0', fontWeight: 600, whiteSpace: 'pre-line' }}>{data.label}</div>
    </div>
  )
}

function WorkerNode({ data }) {
  return (
    <div style={{
      background: '#1a0d00', border: '1.5px solid #f97316', borderRadius: 8,
      padding: '8px 12px', minWidth: 120,
    }}>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <div style={{ fontSize: 9, color: '#f97316', fontWeight: 700, letterSpacing: 1, marginBottom: 3, textTransform: 'uppercase' }}>Confined Space</div>
      <div style={{ fontSize: 11, color: '#e2e8f0', fontWeight: 600, whiteSpace: 'pre-line' }}>{data.label}</div>
    </div>
  )
}

function MaintNode({ data }) {
  return (
    <div style={{
      background: '#120a1a', border: '1.5px solid #a855f7', borderRadius: 8,
      padding: '8px 12px', minWidth: 120,
    }}>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <div style={{ fontSize: 9, color: '#a855f7', fontWeight: 700, letterSpacing: 1, marginBottom: 3, textTransform: 'uppercase' }}>Maintenance</div>
      <div style={{ fontSize: 11, color: '#e2e8f0', fontWeight: 600, whiteSpace: 'pre-line' }}>{data.label}</div>
    </div>
  )
}

function RiskNode({ data }) {
  const colors = LEVEL_COLOR[data.level] ?? LEVEL_COLOR.Safe
  const isCritical = data.level === 'Critical'
  return (
    <div style={{
      background: colors.bg, border: `2px solid ${colors.border}`, borderRadius: 12,
      padding: '12px 18px', minWidth: 160, textAlign: 'center',
      boxShadow: isCritical ? `0 0 20px ${colors.border}55` : 'none',
      transition: 'all 0.5s ease',
    }}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div style={{ fontSize: 9, color: colors.text, fontWeight: 700, letterSpacing: 1, marginBottom: 4, textTransform: 'uppercase' }}>Compound Risk</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: colors.text, fontFamily: 'JetBrains Mono, monospace' }}>
        {data.score ?? '--'}
      </div>
      <div style={{ fontSize: 13, color: colors.text, fontWeight: 700, marginTop: 2 }}>{data.level}</div>
    </div>
  )
}

// ── Custom animated edge ──────────────────────────────────────────────────────

function AnimatedEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd, style }) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
  return (
    <>
      <path id={id} className="react-flow__edge-path" d={edgePath} markerEnd={markerEnd} style={style} />
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              fontSize: 9, fontWeight: 700, background: '#161b27', color: style?.stroke ?? '#8892a4',
              padding: '1px 5px', borderRadius: 4, border: `1px solid ${style?.stroke ?? '#1e2535'}33`,
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

// ── Node types map ────────────────────────────────────────────────────────────

const nodeTypes = { zoneNode: ZoneNode, sensorNode: SensorNode, permitNode: PermitNode, workerNode: WorkerNode, maintNode: MaintNode, riskNode: RiskNode }
const edgeTypes = { animated: AnimatedEdge }

// ── Default placeholder graph ─────────────────────────────────────────────────

const DEFAULT_NODES = [
  { id: 'zone', type: 'zoneNode', data: { label: 'Zone Alpha — Compressor Hall', hazard_class: 'HIGH_RISK' }, position: { x: 200, y: 130 } },
  { id: 'gas',  type: 'sensorNode', data: { label: 'Gas Sensor\n-- ppm', score: 0 }, position: { x: 40, y: 10 } },
  { id: 'risk', type: 'riskNode',   data: { label: 'Compound Risk: --', score: '--', level: 'Safe' }, position: { x: 180, y: 300 } },
]
const DEFAULT_EDGES = [
  { id: 'e-gas-zone', source: 'gas', target: 'zone', type: 'smoothstep', style: { stroke: '#14b8a6', strokeWidth: 1.5 } },
  { id: 'e-zone-risk', source: 'zone', target: 'risk', type: 'smoothstep', style: { stroke: '#3b82f6', strokeWidth: 1.5 } },
]

// ── Main component ────────────────────────────────────────────────────────────

export default function KnowledgeGraph({ currentLevel = 'Safe' }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(DEFAULT_NODES)
  const [edges, setEdges, onEdgesChange] = useEdgesState(DEFAULT_EDGES)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchGraph = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/knowledge-graph/zone-alpha`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()

      // Transform backend nodes/edges into React Flow format
      const rfNodes = (data.nodes ?? []).map(n => ({
        id: n.id,
        type: n.type ?? 'default',
        data: n.data ?? {},
        position: n.position ?? { x: 0, y: 0 },
        draggable: true,
      }))

      const rfEdges = (data.edges ?? []).map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: e.animated ? 'animated' : 'smoothstep',
        data: { label: e.label },
        animated: e.animated ?? false,
        style: {
          ...(e.style ?? {}),
          stroke: e.style?.stroke ?? '#3b82f6',
          strokeWidth: e.style?.strokeWidth ?? 1.5,
        },
        markerEnd: { type: 'arrowclosed', color: e.style?.stroke ?? '#3b82f6' },
      }))

      if (rfNodes.length) setNodes(rfNodes)
      if (rfEdges.length) setEdges(rfEdges)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [setNodes, setEdges])

  useEffect(() => {
    fetchGraph()
    const interval = setInterval(fetchGraph, 3000)
    return () => clearInterval(interval)
  }, [fetchGraph])

  const levelColor = LEVEL_COLOR[currentLevel] ?? LEVEL_COLOR.Safe

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <p className="section-label mb-0">Knowledge Graph</p>
        {loading && <span className="text-[10px] text-surface-muted animate-pulse">Updating…</span>}
        {error  && <span className="text-[10px] text-critical/70">⚠ {error}</span>}
      </div>

      <div
        className="card p-0 overflow-hidden"
        style={{
          height: 300,
          border: `1px solid ${levelColor.border}33`,
          transition: 'border-color 0.5s ease',
        }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          proOptions={{ hideAttribution: true }}
          minZoom={0.4}
          maxZoom={1.8}
        >
          <Background color="#1e2535" gap={20} size={0.8} />
          <Controls
            showInteractive={false}
            style={{ background: '#161b27', border: '1px solid #1e2535', borderRadius: 8 }}
          />
          <MiniMap
            nodeColor={n => {
              if (n.type === 'riskNode') return levelColor.border
              if (n.type === 'zoneNode') return '#3b82f6'
              if (n.type === 'sensorNode') return '#14b8a6'
              if (n.type === 'permitNode') return '#eab308'
              if (n.type === 'workerNode') return '#f97316'
              if (n.type === 'maintNode') return '#a855f7'
              return '#1e2535'
            }}
            maskColor="rgba(15,17,23,0.7)"
            style={{ background: '#0f1117', border: '1px solid #1e2535' }}
          />
        </ReactFlow>
      </div>

      <p className="text-[10px] text-surface-muted mt-2 px-1">
        Live node/edge graph — Zone → Permit → Risk relationships. Powered by React Flow.
      </p>
    </div>
  )
}
