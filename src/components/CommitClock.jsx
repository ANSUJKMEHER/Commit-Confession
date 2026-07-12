import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'

const RADIUS = 120
const CENTER = 160
const INNER = 16

// Hour labels shown at the 4 cardinal positions (12, 6, 18, 0)
const CARDINAL_LABELS = [
  { hour: 0,  label: '12am' },
  { hour: 6,  label: '6am'  },
  { hour: 12, label: '12pm' },
  { hour: 18, label: '6pm'  },
]

export default function CommitClock({ hourCounts }) {
  const [progress, setProgress] = useState(0)
  const [tooltip, setTooltip] = useState(null) // { x, y, hour, count }
  const timerRef = useRef(null)

  useEffect(() => {
    setProgress(0)
    if (timerRef.current) timerRef.current.stop()
    timerRef.current = d3.timer((elapsed) => {
      const p = Math.min(elapsed / 1000, 1)
      setProgress(d3.easeCubicOut(p))
      if (p === 1) timerRef.current.stop()
    })
    return () => timerRef.current?.stop()
  }, [hourCounts])

  const max = Math.max(...hourCounts, 1)
  const angleScale = d3.scaleLinear().domain([0, 24]).range([0, 2 * Math.PI])
  const lenScale   = d3.scaleLinear().domain([0, max]).range([INNER, RADIUS])
  const total      = hourCounts.reduce((a, b) => a + b, 0)
  const peakHour   = hourCounts.indexOf(Math.max(...hourCounts))

  const HOUR_LABELS = [
    '12am','1am','2am','3am','4am','5am','6am','7am',
    '8am','9am','10am','11am','12pm','1pm','2pm','3pm',
    '4pm','5pm','6pm','7pm','8pm','9pm','10pm','11pm',
  ]

  return (
    <div className="commit-clock-wrap">
      <svg
        viewBox={`0 0 ${CENTER * 2} ${CENTER * 2}`}
        className="commit-clock"
        role="img"
        aria-label="Commit activity by hour of day"
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Background ring */}
        <circle cx={CENTER} cy={CENTER} r={RADIUS + 18} className="clock-ring" />
        <circle cx={CENTER} cy={CENTER} r={INNER} className="clock-ring" />

        {/* Cardinal hour labels */}
        {CARDINAL_LABELS.map(({ hour, label }) => {
          const angle = angleScale(hour) - Math.PI / 2
          const dist  = RADIUS + 30
          const x = CENTER + Math.cos(angle) * dist
          const y = CENTER + Math.sin(angle) * dist
          return (
            <text key={hour} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="clock-hour-label">
              {label}
            </text>
          )
        })}

        {/* Tick marks */}
        {hourCounts.map((count, hour) => {
          const angle  = angleScale(hour) - Math.PI / 2
          const rawLen = lenScale(count)
          const len    = INNER + (rawLen - INNER) * progress
          const x1 = CENTER + Math.cos(angle) * INNER
          const y1 = CENTER + Math.sin(angle) * INNER
          const x2 = CENTER + Math.cos(angle) * len
          const y2 = CENTER + Math.sin(angle) * len
          const isLate    = hour < 5
          const isPeak    = hour === peakHour

          // Hitbox for tooltip (wider invisible line)
          const hx1 = CENTER + Math.cos(angle) * INNER
          const hy1 = CENTER + Math.sin(angle) * INNER
          const hx2 = CENTER + Math.cos(angle) * (RADIUS + 4)
          const hy2 = CENTER + Math.sin(angle) * (RADIUS + 4)

          return (
            <g key={hour}>
              <line
                x1={x1} y1={y1} x2={x2} y2={y2}
                className={isLate ? 'tick tick-latenight' : 'tick tick-day'}
                strokeWidth={isPeak ? 7 : isLate ? 5 : 3}
                strokeLinecap="round"
                opacity={count === 0 ? 0.15 : 1}
              />
              {/* Invisible wider hit area */}
              <line
                x1={hx1} y1={hy1} x2={hx2} y2={hy2}
                stroke="transparent"
                strokeWidth={12}
                onMouseEnter={(e) => {
                  const svgRect = e.currentTarget.closest('svg').getBoundingClientRect()
                  setTooltip({
                    x: CENTER + Math.cos(angle) * (RADIUS + 4),
                    y: CENTER + Math.sin(angle) * (RADIUS + 4),
                    hour,
                    count,
                  })
                }}
              />
            </g>
          )
        })}

        {/* Peak hour annotation */}
        {progress > 0.95 && (() => {
          const angle = angleScale(peakHour) - Math.PI / 2
          const tx = CENTER + Math.cos(angle) * (RADIUS + 44)
          const ty = CENTER + Math.sin(angle) * (RADIUS + 44)
          return (
            <text
              x={tx} y={ty}
              textAnchor="middle"
              dominantBaseline="middle"
              className="clock-peak-label"
            >
              ★ {HOUR_LABELS[peakHour]}
            </text>
          )
        })()}

        {/* Tooltip */}
        {tooltip && (
          <g>
            <rect
              x={tooltip.x - 34}
              y={tooltip.y - 20}
              width={68}
              height={32}
              rx={5}
              fill="#1e2032"
              stroke="#2a2d47"
              strokeWidth={1}
            />
            <text x={tooltip.x} y={tooltip.y - 7} textAnchor="middle" className="clock-peak-label" fontSize={9}>
              {HOUR_LABELS[tooltip.hour]}
            </text>
            <text x={tooltip.x} y={tooltip.y + 7} textAnchor="middle" className="clock-hour-label" fontSize={9}>
              {tooltip.count} commit{tooltip.count !== 1 ? 's' : ''}
            </text>
          </g>
        )}

        {/* Center labels */}
        <text x={CENTER} y={CENTER - 8} textAnchor="middle" className="clock-label-main">
          {total}
        </text>
        <text x={CENTER} y={CENTER + 14} textAnchor="middle" className="clock-label-sub">
          commits
        </text>
      </svg>
    </div>
  )
}
