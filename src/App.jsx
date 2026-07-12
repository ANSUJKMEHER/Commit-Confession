import { useState, useEffect, useRef } from 'react'
import CommitClock from './components/CommitClock.jsx'
import StatCard from './components/StatCard.jsx'
import ShareCard from './components/ShareCard.jsx'
import CommitPunchcard from './components/CommitPunchcard.jsx'

// ── Helpers ──────────────────────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function parseInputToOwnerRepo(raw) {
  const cleaned = raw.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '')
  const [owner, repo, ...rest] = cleaned.split('/').map((s) => s.trim())
  if (!owner || !repo || rest.length > 0) return null
  return { owner, repo }
}

// ── Progressive narrative reveal ─────────────────────────────────────────
function useRevealText(text, active) {
  const [revealed, setRevealed] = useState('')
  const rafRef = useRef(null)

  useEffect(() => {
    if (!active || !text) {
      setRevealed(text || '')
      return
    }
    setRevealed('')
    let i = 0
    // Reveal ~4 chars per frame for a smooth-but-fast typewriter effect
    const step = () => {
      i = Math.min(i + 4, text.length)
      setRevealed(text.slice(0, i))
      if (i < text.length) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [text, active])

  return revealed
}

// ── Loading Skeleton ─────────────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <div className="skeleton-wrap" aria-label="Loading analysis…" role="status">
      <div className="skeleton-clock" />
      <div className="skeleton-stats">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton-stat-card" />)}
      </div>
      <div className="skeleton-bar w-full" />
      <div className="skeleton-bar w-75" />
      <div className="skeleton-bar w-full" />
      <div className="skeleton-bar w-55" />
    </div>
  )
}

// ── Main App ─────────────────────────────────────────────────────────────
export default function App() {
  const [input, setInput]             = useState('')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState(null)
  const [result, setResult]           = useState(null)
  const [audioLoading, setAudioLoading] = useState(false)
  const [audioUrl, setAudioUrl]       = useState(null)
  const [currentRepo, setCurrentRepo] = useState(null) // { owner, repo }
  const [cardTheme, setCardTheme]     = useState('classic')
  const [audioBlob, setAudioBlob]     = useState(null)
  const [sharing, setSharing]         = useState(false)
  const [solanaUrl, setSolanaUrl]     = useState(null)
  const [solanaLoading, setSolanaLoading] = useState(false)
  const [solanaNotice, setSolanaNotice]   = useState(null)
  const [customImagePrompt, setCustomImagePrompt] = useState('')
  const [tempPrompt, setTempPrompt] = useState('')
  const [imageSeed, setImageSeed] = useState(42)

  // Populate from URL hash on load (shareable links)
  useEffect(() => {
    const hash = window.location.hash.slice(1) // e.g. "torvalds/linux"
    if (hash) {
      const parsed = parseInputToOwnerRepo(decodeURIComponent(hash))
      if (parsed) {
        setInput(`${parsed.owner}/${parsed.repo}`)
      }
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    const parsed = parseInputToOwnerRepo(input)
    if (!parsed) {
      setError('Enter it as owner/repo — e.g. torvalds/linux — or paste the full GitHub URL.')
      return
    }
    const { owner, repo } = parsed
    setLoading(true)
    setError(null)
    setResult(null)
    setAudioUrl(null)
    setCurrentRepo({ owner, repo })

    // Update URL hash so the result is shareable
    window.history.replaceState(null, '', `#${encodeURIComponent(`${owner}/${repo}`)}`)

    try {
      const r = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, repo }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Something went wrong')
      setResult(data)
    } catch (err) {
      setError(err.message)
      window.history.replaceState(null, '', window.location.pathname)
    } finally {
      setLoading(false)
    }
  }

  async function handleListen() {
    const narrativeText = result?.narrative?.narrative
    if (!narrativeText) return
    setAudioLoading(true)
    setError(null)
    try {
      const r = await fetch('/api/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: narrativeText }),
      })
      if (!r.ok) {
        const data = await r.json().catch(() => ({}))
        throw new Error(data.error || 'Narration failed — check your ElevenLabs key')
      }
      const blob = await r.blob()
      setAudioBlob(blob)
      setAudioUrl(URL.createObjectURL(blob))
    } catch (err) {
      setError(err.message)
    } finally {
      setAudioLoading(false)
    }
  }

  function handleReset() {
    setResult(null)
    setError(null)
    setAudioUrl(null)
    setAudioBlob(null)
    setSolanaUrl(null)
    setSolanaNotice(null)
    setCustomImagePrompt('')
    setTempPrompt('')
    setImageSeed(42)
    setCurrentRepo(null)
    setInput('')
    window.history.replaceState(null, '', window.location.pathname)
  }

  // Narrative text reveal animation
  const narrativeText = result?.narrative?.narrative || ''
  const revealedNarrative = useRevealText(narrativeText, !!result)

  const { stats, persona, narrative, repoMeta } = result || {}
  const shareCardRef = useRef(null)
  const bgAudioRef = useRef(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (bgAudioRef.current) {
      bgAudioRef.current.volume = 0.12
    }
  }, [result]) // reset volume whenever results load

  function handleCopyLink() {
    const url = `${window.location.origin}/#${currentRepo?.owner}/${currentRepo?.repo}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleDownloadAudio() {
    if (!audioUrl) return
    const link = document.createElement('a')
    link.href = audioUrl
    link.download = `commit-confession-${currentRepo?.owner}-${currentRepo?.repo}.mp3`
    link.click()
  }

  async function handleDownloadCard() {
    if (!shareCardRef.current) return
    try {
      // Dynamically import html2canvas only when needed
      const { default: html2canvas } = await import('https://esm.sh/html2canvas@1.4.1')
      const canvas = await html2canvas(shareCardRef.current, {
        backgroundColor: null,
        scale: 2,
        logging: false,
      })
      const link = document.createElement('a')
      link.download = `commit-confessions-${currentRepo?.owner}-${currentRepo?.repo}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (e) {
      console.error('Share card download failed:', e)
    }
  }

  async function handleNativeShare() {
    if (!shareCardRef.current) return
    setSharing(true)
    setError(null)
    try {
      // 1. Capture the Card PNG as a blob
      const { default: html2canvas } = await import('https://esm.sh/html2canvas@1.4.1')
      const canvas = await html2canvas(shareCardRef.current, {
        backgroundColor: null,
        scale: 2,
        logging: false,
      })

      // Convert canvas to Blob
      const cardBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
      const cardFile = new File([cardBlob], `commit-confession-${currentRepo?.owner}-${currentRepo?.repo}.png`, { type: 'image/png' })

      // 2. Package ElevenLabs MP3 Narration if available
      const filesArray = [cardFile]
      if (audioBlob) {
        const audioFile = new File([audioBlob], `narration-${currentRepo?.owner}-${currentRepo?.repo}.mp3`, { type: 'audio/mp3' })
        filesArray.push(audioFile)
      }

      // 3. Invoke Web Share API
      const shareUrl = `${window.location.origin}/#${currentRepo?.owner}/${currentRepo?.repo}`
      const shareText = `Just confessed my Git history on Commit Confessions! 🔮 My alignment is ${persona?.alignment} (${persona?.alignmentEmoji}). Compare yours:`

      if (navigator.canShare && navigator.canShare({ files: filesArray })) {
        await navigator.share({
          files: filesArray,
          title: 'Commit Confessions',
          text: shareText,
          url: shareUrl,
        })
      } else if (navigator.share) {
        // Fallback if browser can share text/links but not files
        await navigator.share({
          title: 'Commit Confessions',
          text: shareText,
          url: shareUrl,
        })
      } else {
        throw new Error('Web Share API is not supported in this browser. Please use the download buttons below to save and share manually.')
      }
    } catch (err) {
      // Don't show error if user cancelled the share sheet manually
      if (err.name !== 'AbortError') {
        setError(err.message)
      }
    } finally {
      setSharing(false)
    }
  }

  async function handleRegisterSolana() {
    setSolanaLoading(true)
    setSolanaNotice(null)
    setError(null)
    try {
      const r = await fetch('/api/solana-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: currentRepo?.owner,
          repo: currentRepo?.repo,
          stats,
          alignment: persona?.alignment,
        }),
      })
      const text = await r.text()
      let data = {}
      try {
        data = JSON.parse(text)
      } catch (parseErr) {
        throw new Error('Vercel server returned an invalid response. Please check your Vercel logs.')
      }
      if (!r.ok) throw new Error(data.error || 'Solana registration failed')
      
      if (data.error) {
        setSolanaNotice({ message: data.error })
      } else if (data.rateLimited) {
        setSolanaNotice(data)
      } else {
        setSolanaUrl(data.solscanUrl)
        setSolanaNotice(null)
      }
    } catch (err) {
      setSolanaNotice({ message: err.message || 'Solana connection error' })
    } finally {
      setSolanaLoading(false)
    }
  }

  return (
    <div className="page">
      {/* Animated background glow orbs */}
      <div className="bg-glow-container" aria-hidden="true">
        <div className="bg-glow-orb-1" />
        <div className="bg-glow-orb-2" />
      </div>
      {/* ── Hero ── */}
      <header className="hero">
        <p className="hero-eyebrow">Weekend Challenge · Passion Edition</p>
        <h1 className="site-title">Commit Confessions</h1>
        <p className="tagline">
          Your git history, read back to you like a confession.
        </p>
      </header>

      {/* ── Input ── */}
      {!result && (
        <section className="input-section">
          <label htmlFor="repo-input" className="input-label">GitHub repository</label>
          <form onSubmit={handleSubmit} className="input-row">
            <input
              id="repo-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="owner/repo — or paste a GitHub URL"
              className="repo-input"
              aria-label="GitHub repository"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit" className="btn-primary" disabled={loading || !input.trim()}>
              {loading ? 'Reading…' : 'Confess →'}
            </button>
          </form>
        </section>
      )}

      {/* ── Error ── */}
      {error && (
        <p className="error-msg" role="alert">
          <span aria-hidden="true">⚠</span>
          {error}
        </p>
      )}

      {/* ── Loading skeleton ── */}
      {loading && <LoadingSkeleton />}

      {/* ── Results ── */}
      {result && (
        <div className="result">
          {/* Repo meta row */}
          <div className="repo-meta">
            <span className="repo-name">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>
              <strong>{currentRepo?.owner}</strong>/{currentRepo?.repo}
            </span>
            {repoMeta?.stars > 0 && (
              <span className="repo-badge">⭐ {repoMeta.stars.toLocaleString()}</span>
            )}
            {repoMeta?.language && (
              <span className="repo-badge lang">{repoMeta.language}</span>
            )}
            {stats?.firstDate && (
              <span className="repo-badge">
                {formatDate(stats.firstDate)} – {formatDate(stats.lastDate)}
              </span>
            )}
          </div>

          {/* Persona badge */}
          {persona && (
            <div className="persona-badge">
              <span className="persona-emoji">{persona.emoji}</span>
              <div className="persona-text">
                <span className="persona-label">{persona.label}</span>
                <span className="persona-tagline">{persona.tagline}</span>
              </div>
              {persona.runnerUp && (
                <span className="persona-runner-up" title={`Also: ${persona.runnerUp.label}`}>
                  {persona.runnerUp.emoji}
                </span>
              )}
            </div>
          )}

          {/* Horoscope & Alignment Section */}
          {persona && (
            <div className="astral-grid">
              <div className="astral-card alignment-card">
                <span className="astral-card-icon">{persona.alignmentEmoji}</span>
                <div className="astral-card-content">
                  <h3>Coding Alignment</h3>
                  <h4 className="alignment-name">{persona.alignment}</h4>
                  <p>{persona.alignmentTagline}</p>
                </div>
              </div>
              
              <div className="astral-card horoscope-card">
                <span className="astral-card-icon">✨</span>
                <div className="astral-card-content">
                  <h3>Developer Horoscope</h3>
                  <p>{persona.horoscope}</p>
                </div>
              </div>
            </div>
          )}

          {/* Rage Meter */}
          {persona?.rageMeter && (
            <div className="rage-meter-container">
              <div className="rage-meter-header">
                <span className="rage-meter-title">Rage Coder Index</span>
                <span className="rage-meter-value">{persona.rageMeter.emoji} {persona.rageMeter.label} ({stats.ragePct}%)</span>
              </div>
              <div className="rage-meter-bar">
                <div className="rage-meter-fill" style={{ width: `${persona.rageMeter.level}%` }}>
                  <div className="rage-meter-glow" />
                </div>
              </div>
              <p className="rage-meter-description">Calculated from the frequency of fix, wtf, stupid, please, or god in commit logs.</p>
            </div>
          )}

          {/* Commit clock visualization */}
          <CommitClock hourCounts={stats.hourCounts} />

          {/* Commit Punchcard matrix map */}
          <CommitPunchcard matrix={stats.punchCard} />

          {/* Stat cards */}
          <div className="stat-grid" aria-label="Repository statistics">
            <StatCard
              icon="🔥"
              value={stats.totalCommits.toLocaleString()}
              label="Commits"
            />
            <StatCard
              icon="🌙"
              value={`${stats.lateNightPct}%`}
              label="After midnight"
            />
            <StatCard
              icon="📅"
              value={`${stats.weekendPct}%`}
              label="Weekends"
            />
            <StatCard
              icon="⚡"
              value={`${stats.longestStreak}d`}
              label="Best streak"
            />
          </div>

          {/* Narrative */}
          <div className="narrative-section">
            <h2 className="narrative-title">{narrative?.title}</h2>
            <p className="narrative-body">{revealedNarrative}</p>
            {narrative?.verdict && revealedNarrative === narrativeText && (
              <>
                <hr className="narrative-divider" />
                <p className="narrative-verdict">"{narrative.verdict}"</p>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="actions-row">
            <button
              id="listen-btn"
              onClick={handleListen}
              disabled={audioLoading}
              className="btn-listen"
              aria-label="Hear the narrative narrated aloud"
            >
              <span className="listen-icon" aria-hidden="true">
                {audioLoading ? '⏳' : '🎙'}
              </span>
              {audioLoading ? 'Recording voiceover…' : 'Hear it narrated'}
            </button>
            <button
              id="download-card-btn"
              onClick={handleDownloadCard}
              className="btn-ghost"
              title="Download share card as PNG"
            >
              ↓ Share card
            </button>
            <button
              id="try-another-btn"
              onClick={handleReset}
              className="btn-ghost"
            >
              Try another repo
            </button>
          </div>

          {audioUrl && (
            <audio
              id="narrative-audio"
              src={audioUrl}
              controls
              autoPlay
              className="audio-player"
              aria-label="Narrated confession"
              onPlay={() => bgAudioRef.current?.play()}
              onPause={() => bgAudioRef.current?.pause()}
              onEnded={() => {
                if (bgAudioRef.current) {
                  bgAudioRef.current.pause();
                  bgAudioRef.current.currentTime = 0;
                }
              }}
            />
          )}

          {/* Hidden atmospheric loop */}
          <audio
            ref={bgAudioRef}
            src="https://assets.mixkit.co/music/preview/mixkit-deep-urban-62.mp3"
            loop
          />

          {/* Share card & Dashboard — rendered on-page, screenshot or download */}
          {result && narrativeText && (
            <div className="share-card-section">
              <div className="share-card-header-row">
                <p className="share-card-hint">↓ Customize & Save Share Card</p>
                <div className="theme-selector">
                  {['classic', 'cyberpunk', 'hacker', 'sunset'].map((t) => (
                    <button
                      key={t}
                      className={`theme-btn ${cardTheme === t ? 'active' : ''}`}
                      onClick={() => setCardTheme(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Image customization row */}
              <div className="image-control-row">
                <input
                  type="text"
                  className="image-prompt-input"
                  placeholder="Describe your own cover art (Press Enter or click Generate)"
                  value={tempPrompt}
                  onChange={(e) => setTempPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setCustomImagePrompt(tempPrompt)
                    }
                  }}
                />
                <button
                  className="btn-primary"
                  style={{ whiteSpace: 'nowrap', padding: '9px 16px', fontSize: '0.75rem' }}
                  onClick={() => setCustomImagePrompt(tempPrompt)}
                >
                  🎨 Generate
                </button>
                <button
                  className="btn-ghost btn-regen-image"
                  onClick={() => {
                    setImageSeed(Math.floor(Math.random() * 99999))
                  }}
                  title="Generate a new variation"
                >
                  🔄 New Seed
                </button>
              </div>
              
              <ShareCard
                cardRef={shareCardRef}
                owner={currentRepo?.owner}
                repo={currentRepo?.repo}
                persona={persona}
                stats={stats}
                narrative={narrative}
                theme={cardTheme}
                customImagePrompt={customImagePrompt}
                imageSeed={imageSeed}
              />

              <div className="share-dashboard">
                <h4 className="share-dashboard-title">Export & Share Confession</h4>
                <p className="share-dashboard-intro">Send your card and cinematic audio narration directly to other apps, or follow the steps below to post manually:</p>

                <button
                  onClick={handleNativeShare}
                  disabled={sharing}
                  className="btn-primary btn-native-share"
                  style={{ width: '100%', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
                >
                  {sharing ? '🎨 Preparing media files...' : '⚡ Share Confession (Card + Audio)'}
                </button>

                {/* Solana Devnet Proof of Passion */}
                <div className="solana-box" style={{ marginBottom: '24px', padding: '16px', background: 'rgba(155, 125, 232, 0.05)', border: '1px solid rgba(155, 125, 232, 0.25)', borderRadius: 'var(--radius)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'JetBrains Mono', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--violet)' }}>Solana Blockchain Proof</span>
                    {solanaUrl && <span style={{ fontSize: '0.78rem', color: 'var(--teal)' }}>🟢 Registered</span>}
                  </div>
                  <h5 style={{ fontFamily: 'Fraunces', Georgia: 'serif', fontSize: '1.05rem', fontWeight: 600, color: 'var(--paper)', margin: 0, textAlign: 'left' }}>Mint Immutable Proof of Passion</h5>
                  <p style={{ fontSize: '0.82rem', color: 'var(--paper-dim)', lineHeight: 1.4, margin: 0, textAlign: 'left' }}>Lock your Git telemetry (commits, alignment, and alignment archetype) permanently on the Solana Devnet blockchain using the Memo program.</p>
                  
                  {solanaUrl ? (
                    <a
                      href={solanaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-ghost"
                      style={{ textAlign: 'center', borderColor: 'var(--violet)', color: 'var(--violet)', display: 'block', textDecoration: 'none', fontSize: '0.78rem', fontWeight: 600 }}
                    >
                      👁️ View Solana Transaction on Solscan
                    </a>
                  ) : solanaNotice ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(235, 94, 85, 0.08)', border: '1px dashed rgba(235, 94, 85, 0.3)', borderRadius: 'var(--radius)', padding: '12px', marginTop: '4px' }}>
                      <p style={{ fontSize: '0.78rem', color: 'var(--amber)', margin: 0, textAlign: 'left', lineHeight: 1.3 }}>
                        ⚠️ {solanaNotice.message}
                      </p>
                      <button
                        onClick={handleRegisterSolana}
                        disabled={solanaLoading}
                        className="btn-ghost"
                        style={{ borderColor: 'var(--violet)', color: 'var(--paper)', fontSize: '0.75rem', padding: '6px 0', marginTop: '4px' }}
                      >
                        {solanaLoading ? '⚡ Checking balance & sending...' : '🔄 I funded it, try registering again!'}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={handleRegisterSolana}
                      disabled={solanaLoading}
                      className="btn-ghost"
                      style={{ borderColor: 'rgba(155, 125, 232, 0.5)', color: 'var(--paper)', fontSize: '0.78rem', padding: '10px 0' }}
                    >
                      {solanaLoading ? '⚡ Recording on Devnet...' : '⛓️ Register Confession On-Chain (Free)'}
                    </button>
                  )}
                </div>
                
                <ol className="share-steps">
                  <li>
                    <span className="step-num">1</span>
                    <span className="step-text">Download your visual card and cinematic narration:</span>
                    <div className="share-download-buttons">
                      <button onClick={handleDownloadCard} className="btn-share-download">
                        🖼️ Download Card (PNG)
                      </button>
                      <button
                        onClick={handleDownloadAudio}
                        disabled={!audioUrl}
                        className="btn-share-download"
                        title={!audioUrl ? "Click 'Hear it narrated' above first to generate the audio file" : ""}
                      >
                        {audioUrl ? "🎵 Download Narration (MP3)" : "🎙️ Narration not generated yet (Click 'Hear it narrated' above)"}
                      </button>
                    </div>
                  </li>
                  
                  <li>
                    <span className="step-num">2</span>
                    <span className="step-text">Choose a platform to prepare your post details:</span>
                    <div className="share-social-buttons">
                      <a
                        href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
                          `Just confessed my Git history on Commit Confessions! 🔮 My alignment is ${persona?.alignment} (${persona?.alignmentEmoji}). Hear my cinematic ElevenLabs narration:\n\n`
                        )}&url=${encodeURIComponent(`${window.location.origin}/#${currentRepo?.owner}/${currentRepo?.repo}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-social-share twitter"
                      >
                        Post to X / Twitter
                      </a>
                      <a
                        href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(`${window.location.origin}/#${currentRepo?.owner}/${currentRepo?.repo}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-social-share linkedin"
                        onClick={() => {
                          navigator.clipboard.writeText(
                            `Just confessed my Git history on Commit Confessions! 🔮 My alignment is ${persona?.alignment} (${persona?.alignmentEmoji}). Compare yours: ${window.location.origin}/#${currentRepo?.owner}/${currentRepo?.repo}`
                          );
                          alert("LinkedIn sharing page opened. We've copied your pre-written post description to your clipboard so you can paste it directly!");
                        }}
                      >
                        Post to LinkedIn
                      </a>
                      <button onClick={handleCopyLink} className="btn-social-share link">
                        {copied ? '✅ Link Copied!' : '🔗 Copy Share Link'}
                      </button>
                    </div>
                  </li>
                  
                  <li>
                    <span className="step-num">3</span>
                    <span className="step-text">Attach the downloaded PNG image and MP3 audio file to the post to complete the confession!</span>
                  </li>
                </ol>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Footer ── */}
      <footer className="site-footer">
        <span>Built for DEV Weekend Challenge · Passion Edition</span>
        <span className="footer-badge">✦ Gemini</span>
        <span className="footer-badge">♪ ElevenLabs</span>
        <span className="footer-badge">⌥ GitHub API</span>
      </footer>
    </div>
  )
}
