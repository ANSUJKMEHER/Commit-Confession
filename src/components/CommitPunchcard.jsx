import { useState } from 'react'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HOURS = [
  '12a', '1a', '2a', '3a', '4a', '5a', '6a', '7a', '8a', '9a', '10a', '11a',
  '12p', '1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p', '10p', '11p'
]

export default function CommitPunchcard({ matrix }) {
  const [hovered, setHovered] = useState(null) // { day, hour, count }

  if (!matrix || matrix.length === 0) return null

  // Find max count in matrix to scale colors
  let maxCount = 1
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      if (matrix[d][h] > maxCount) {
        maxCount = matrix[d][h]
      }
    }
  }

  return (
    <div className="punchcard-container">
      <h3 className="section-subtitle">Weekly Activity Rhythm</h3>
      <p className="section-description">A granular mapping of your hour-by-hour commit density across the week.</p>
      
      <div className="punchcard-grid-wrapper">
        <div className="punchcard-y-axis">
          {DAYS.map((day, d) => (
            <div key={d} className="punchcard-label y">{day}</div>
          ))}
        </div>
        
        <div className="punchcard-grid-body">
          {matrix.map((row, d) => (
            <div key={d} className="punchcard-row">
              {row.map((count, h) => {
                const ratio = count / maxCount
                const opacity = count === 0 ? 0.08 : 0.15 + ratio * 0.85
                const isLateNight = h < 5
                
                // Color scaling
                let colorClass = 'punchcard-dot-day'
                if (isLateNight && count > 0) {
                  colorClass = 'punchcard-dot-latenight'
                } else if (count > 0 && count >= maxCount * 0.7) {
                  colorClass = 'punchcard-dot-peak'
                }

                return (
                  <div
                    key={h}
                    className={`punchcard-dot ${colorClass}`}
                    style={{
                      opacity,
                      transform: count > 0 ? `scale(${0.75 + ratio * 0.25})` : 'scale(0.7)'
                    }}
                    onMouseEnter={() => setHovered({ day: d, hour: h, count })}
                    onMouseLeave={() => setHovered(null)}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>
      
      <div className="punchcard-x-axis">
        {HOURS.filter((_, idx) => idx % 2 === 0).map((hour, idx) => (
          <div key={idx} className="punchcard-label x">{hour}</div>
        ))}
      </div>

      <div className="punchcard-tooltip-display">
        {hovered ? (
          <span>
            <strong>{DAYS[hovered.day]}</strong> at <strong>{HOURS[hovered.hour] === '12a' ? 'Midnight' : HOURS[hovered.hour] === '12p' ? 'Noon' : HOURS[hovered.hour]}</strong>: {hovered.count} commit{hovered.count !== 1 ? 's' : ''}
          </span>
        ) : (
          <span className="tooltip-hint">Hover over grid squares to inspect rhythm</span>
        )}
      </div>
    </div>
  )
}
