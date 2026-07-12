import { useState, useEffect } from 'react'

// Generative constellation background for the card
function renderConstellation(punchCard) {
  if (!punchCard || punchCard.length === 0) return null

  const stars = []
  const lines = []
  const paddingX = 40
  const paddingY = 25
  const width = 580
  const height = 180

  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const count = punchCard[d][h]
      if (count > 0) {
        const x = paddingX + (h / 23) * (width - 2 * paddingX)
        const y = paddingY + (d / 6) * (height - 2 * paddingY)
        stars.push({ x, y, count })
      }
    }
  }

  for (let i = 0; i < stars.length; i++) {
    for (let j = i + 1; j < stars.length; j++) {
      const dist = Math.hypot(stars[i].x - stars[j].x, stars[i].y - stars[j].y)
      if (dist < 55) {
        lines.push({
          x1: stars[i].x, y1: stars[i].y,
          x2: stars[j].x, y2: stars[j].y,
          opacity: 0.18 * (1 - dist / 55)
        })
      }
    }
  }

  return (
    <svg className="share-card-constellation" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {lines.map((l, idx) => (
        <line key={`l-${idx}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
          stroke="currentColor" strokeWidth="0.8" opacity={l.opacity} />
      ))}
      {stars.map((s, idx) => {
        const size = 1 + Math.min(3, s.count * 0.4)
        return (
          <g key={`s-${idx}`}>
            <circle cx={s.x} cy={s.y} r={size * 2} fill="currentColor" opacity="0.12" />
            <circle cx={s.x} cy={s.y} r={size * 0.7} fill="currentColor" opacity="0.85" />
          </g>
        )
      })}
    </svg>
  )
}

// Enhance short user prompts into richer image generation prompts
function enhancePrompt(raw) {
  if (!raw) return ''
  const suffix = ', digital art, dark background, high quality, detailed, glowing neon accents, 4k'
  if (raw.length < 80) {
    return `A beautiful abstract illustration of ${raw}${suffix}`
  }
  return raw + suffix
}

export default function ShareCard({ owner, repo, persona, stats, narrative, cardRef, theme = 'classic', customImagePrompt = '', imageSeed = 42 }) {
  const busiestHour = stats?.busiestHourLabel || ''
  const streak = stats?.longestStreak || 0
  const lateNight = stats?.lateNightPct || 0
  const verdict = narrative?.verdict || ''
  const title = narrative?.title || ''

  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgError, setImgError] = useState(false)

  // Priority: user custom prompt (enhanced) > AI-generated prompt > fallback
  const defaultPrompt = `abstract glowing cyberpunk geometric vector illustration for developer coding project ${owner} ${repo}, neon digital tech art, synthwave 3d style`
  const rawPrompt = customImagePrompt || narrative?.imagePrompt || defaultPrompt
  const imagePrompt = customImagePrompt ? enhancePrompt(customImagePrompt) : rawPrompt
  const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?width=512&height=512&nologo=true&seed=${imageSeed}`

  // Reset loading state when prompt or seed changes
  useEffect(() => {
    setImgLoaded(false)
    setImgError(false)
  }, [imagePrompt, imageSeed])

  return (
    <div ref={cardRef} className={`share-card theme-${theme}`} aria-hidden="true">
      {/* Background visual elements */}
      <div className="share-card-bg" />
      <div className="share-card-grid-pattern" />
      {renderConstellation(stats?.punchCard)}

      <div className="share-card-inner">
        {/* Top: brand header */}
        <div className="share-card-brand">
          <span>Commit Confessions</span>
          <span className="share-card-tag font-mono">{persona?.alignment}</span>
        </div>

        <div className="share-card-content-wrapper" style={{ display: 'flex', gap: '20px', alignItems: 'center', flex: 1, minHeight: 0 }}>
          {/* Left Side */}
          <div className="share-card-left" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
            <div className="share-card-mid" style={{ margin: 0 }}>
              <div className="share-card-persona">
                <span className="share-card-persona-emoji">{persona?.emoji}</span>
                <h2 className="share-card-persona-label" style={{ fontSize: '1.25rem' }}>{persona?.label}</h2>
              </div>
              <div className="share-card-repo font-mono" style={{ fontSize: '0.68rem', marginTop: '2px' }}>
                {owner}/{repo}
              </div>
            </div>

            {title && <div className="share-card-title" style={{ fontSize: '0.88rem', margin: '2px 0' }}>"{title}"</div>}

            <div className="share-card-stats" style={{ gap: '15px' }}>
              <div className="share-card-stat">
                <span className="share-card-stat-value" style={{ fontSize: '0.95rem' }}>{stats?.totalCommits?.toLocaleString()}</span>
                <span className="share-card-stat-label" style={{ fontSize: '0.55rem' }}>commits</span>
              </div>
              <div className="share-card-stat">
                <span className="share-card-stat-value" style={{ fontSize: '0.95rem' }}>{lateNight}%</span>
                <span className="share-card-stat-label" style={{ fontSize: '0.55rem' }}>nocturnal</span>
              </div>
              <div className="share-card-stat">
                <span className="share-card-stat-value" style={{ fontSize: '0.95rem' }}>{streak}d</span>
                <span className="share-card-stat-label" style={{ fontSize: '0.55rem' }}>streak</span>
              </div>
              <div className="share-card-stat">
                <span className="share-card-stat-value" style={{ fontSize: '0.95rem' }}>{busiestHour}</span>
                <span className="share-card-stat-label" style={{ fontSize: '0.55rem' }}>peak</span>
              </div>
            </div>

            {verdict && (
              <div className="share-card-verdict" style={{ fontSize: '0.75rem', marginTop: '2px' }}>
                <span className="verdict-quote-mark">&ldquo;</span>
                {verdict}
                <span className="verdict-quote-mark">&rdquo;</span>
              </div>
            )}
          </div>

          {/* Right Side: AI Generated Cover Art */}
          <div className="share-card-right" style={{
            width: '130px', height: '130px', flexShrink: 0, position: 'relative',
            borderRadius: '10px', overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            background: 'rgba(0,0,0,0.3)',
          }}>
            {/* Shimmer placeholder while loading */}
            {!imgLoaded && !imgError && (
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(110deg, rgba(255,255,255,0.03) 30%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 70%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer-bg 1.5s ease-in-out infinite',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.55rem', color: 'rgba(255,255,255,0.35)',
                fontFamily: 'JetBrains Mono, monospace',
              }}>
                ✨ Loading...
              </div>
            )}

            {/* Error fallback */}
            {imgError && (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '3rem',
              }}>
                {persona?.emoji || '🔮'}
              </div>
            )}

            {/* The actual image */}
            <img
              key={`${imagePrompt}-${imageSeed}`}
              src={imageUrl}
              alt=""
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
              style={{
                width: '100%', height: '100%',
                objectFit: 'cover',
                display: imgLoaded ? 'block' : 'none',
              }}
            />

            <div style={{
              position: 'absolute', bottom: '4px', right: '4px',
              background: 'rgba(0,0,0,0.6)', padding: '2px 5px',
              borderRadius: '3px', fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.45rem', color: 'rgba(255,255,255,0.7)',
              letterSpacing: '0.05em',
            }}>AI ART</div>
          </div>
        </div>

        {/* Footer */}
        <div className="share-card-footer" style={{ marginTop: '6px' }}>
          <span>Google AI + ElevenLabs + Solana</span>
          <span className="font-mono">commit-confessions.vercel.app</span>
        </div>
      </div>
    </div>
  )
}
