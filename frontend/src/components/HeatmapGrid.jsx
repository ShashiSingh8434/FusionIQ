/**
 * HeatmapGrid.jsx — Geospatial Safety Heatmap (Day 6)
 *
 * Renders an SVG grid over the plant layout. Each cell corresponds to a zone,
 * with fill color and opacity driven by the zone's hazard score.
 *
 * Props
 * -----
 * zones : Array<{ id, name, x, y, score, level, gas_ppm, gas_threshold }>
 *
 * The grid is 6 columns × 4 rows (matching the plant layout described in the
 * scenario).  Zone positions are mapped from (x, y) in scenario.json
 * (zone-alpha: 2,1  zone-beta: 0,0  zone-gamma: 4,2) to grid cells.
 */

import { useMemo } from 'react'

// ── Constants ────────────────────────────────────────────────────────────────
const GRID_COLS = 6
const GRID_ROWS = 4
const CELL_W    = 88
const CELL_H    = 64
const PADDING   = 14
const SVG_W     = GRID_COLS * CELL_W + PADDING * 2
const SVG_H     = GRID_ROWS * CELL_H + PADDING * 2

// ── Color helpers ────────────────────────────────────────────────────────────

/** Map a hazard level to its base HSL fill color */
const LEVEL_COLORS = {
  Safe:     { h: 142, s: 71, l: 45, stroke: '#22c55e' },  // green
  Elevated: { h: 48,  s: 95, l: 53, stroke: '#eab308' },  // yellow
  High:     { h: 25,  s: 95, l: 53, stroke: '#f97316' },  // orange
  Critical: { h: 0,   s: 84, l: 60, stroke: '#ef4444' },  // red
}

function scoreToOpacity(score) {
  // Min opacity 0.06 (barely visible for Safe), max 0.55 for Critical
  return 0.06 + (score / 100) * 0.49
}

function levelColor(level) {
  return LEVEL_COLORS[level] ?? LEVEL_COLORS.Safe
}

// ── Sub-components ───────────────────────────────────────────────────────────

function GridBackground() {
  const cells = []
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      cells.push(
        <rect
          key={`bg-${row}-${col}`}
          x={PADDING + col * CELL_W}
          y={PADDING + row * CELL_H}
          width={CELL_W - 2}
          height={CELL_H - 2}
          rx={4}
          fill="none"
          stroke="#1e2535"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      )
    }
  }
  return <>{cells}</>
}

function ZoneCell({ zone }) {
  const cx = PADDING + zone.x * CELL_W + CELL_W / 2
  const cy = PADDING + zone.y * CELL_H + CELL_H / 2
  const color = levelColor(zone.level)
  const opacity = scoreToOpacity(zone.score)
  const isCritical = zone.level === 'Critical'
  const isHigh     = zone.level === 'High'

  return (
    <g key={zone.id} className="zone-cell">
      {/* Background heat overlay */}
      <rect
        x={PADDING + zone.x * CELL_W + 1}
        y={PADDING + zone.y * CELL_H + 1}
        width={CELL_W - 4}
        height={CELL_H - 4}
        rx={6}
        fill={`hsl(${color.h},${color.s}%,${color.l}%)`}
        fillOpacity={opacity}
        stroke={color.stroke}
        strokeWidth={isCritical ? 2 : isHigh ? 1.5 : 1}
        strokeOpacity={isCritical ? 0.9 : isHigh ? 0.7 : 0.4}
        style={{
          transition: 'all 0.8s ease',
          filter: (isCritical || isHigh) ? `drop-shadow(0 0 6px ${color.stroke}88)` : 'none',
        }}
      />

      {/* Score ring */}
      <circle
        cx={cx}
        cy={cy - 6}
        r={18}
        fill={`hsl(${color.h},${color.s}%,${color.l}%)`}
        fillOpacity={Math.min(0.9, opacity + 0.3)}
        stroke={color.stroke}
        strokeWidth={isCritical ? 2.5 : 1.5}
        strokeOpacity={0.8}
        style={{ transition: 'all 0.8s ease' }}
      />

      {/* Score number */}
      <text
        x={cx}
        y={cy - 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={12}
        fontWeight="700"
        fontFamily="JetBrains Mono, monospace"
        fill={color.stroke}
        style={{ transition: 'all 0.8s ease' }}
      >
        {Math.round(zone.score)}
      </text>

      {/* Zone label */}
      <text
        x={cx}
        y={cy + 18}
        textAnchor="middle"
        fontSize={8.5}
        fontWeight="600"
        fontFamily="Inter, sans-serif"
        fill={isCritical || isHigh ? color.stroke : '#8892a4'}
        style={{ transition: 'color 0.8s ease' }}
      >
        {zone.name.split('—')[0].trim()}
      </text>

      {/* Pulsing dot for Critical */}
      {isCritical && (
        <>
          <circle cx={PADDING + zone.x * CELL_W + CELL_W - 12} cy={PADDING + zone.y * CELL_H + 10} r={5} fill="#ef4444" opacity={0.9}>
            <animate attributeName="r" values="5;8;5" dur="1.2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.9;0.3;0.9" dur="1.2s" repeatCount="indefinite" />
          </circle>
        </>
      )}
    </g>
  )
}

// ── Legend ───────────────────────────────────────────────────────────────────

function Legend() {
  const items = [
    { label: 'Safe',     color: '#22c55e' },
    { label: 'Elevated', color: '#eab308' },
    { label: 'High',     color: '#f97316' },
    { label: 'Critical', color: '#ef4444' },
  ]
  return (
    <div className="flex items-center gap-4 mt-4 px-1">
      {items.map(({ label, color }) => (
        <div key={label} className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color, opacity: 0.8 }} />
          <span className="text-xs text-surface-muted">{label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function HeatmapGrid({ zones = [] }) {
  // Build a lookup keyed by id for fast access
  const zoneMap = useMemo(
    () => Object.fromEntries(zones.map(z => [z.id, z])),
    [zones]
  )

  return (
    <div className="animate-fade-in">
      <div className="section-label-lg">Geospatial Safety Heatmap</div>

      <div className="relative card-lg overflow-hidden">
        {/* Plant label */}
        <div className="absolute top-4 left-5 z-10">
          <span className="text-[10px] font-mono text-surface-muted/60 uppercase tracking-widest">
            Plant Layout — Simulated
          </span>
        </div>

        <svg
          width="100%"
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          style={{ overflow: 'visible' }}
        >
          {/* Background grid */}
          <GridBackground />

          {/* Zone overlays */}
          {zones.map(zone => (
            <ZoneCell key={zone.id} zone={zone} />
          ))}

          {/* Connection lines between zones */}
          <line
            x1={PADDING + 0 * CELL_W + CELL_W / 2}
            y1={PADDING + 0 * CELL_H + CELL_H / 2}
            x2={PADDING + 2 * CELL_W + CELL_W / 2}
            y2={PADDING + 1 * CELL_H + CELL_H / 2}
            stroke="#1e2535" strokeWidth={1.5} strokeDasharray="4 3"
          />
          <line
            x1={PADDING + 2 * CELL_W + CELL_W / 2}
            y1={PADDING + 1 * CELL_H + CELL_H / 2}
            x2={PADDING + 4 * CELL_W + CELL_W / 2}
            y2={PADDING + 2 * CELL_H + CELL_H / 2}
            stroke="#1e2535" strokeWidth={1.5} strokeDasharray="4 3"
          />
        </svg>

        <Legend />
      </div>
    </div>
  )
}
