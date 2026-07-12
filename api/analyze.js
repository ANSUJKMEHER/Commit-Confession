// Vercel serverless function.
// POST { owner, repo } -> { stats, narrative: { title, narrative, verdict } }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' })
  }

  const { owner, repo } = req.body || {}
  if (!owner || !repo) {
    return res.status(400).json({ error: 'owner and repo are required' })
  }

  try {
    const { commits, repoMeta } = await fetchCommitsAndMeta(owner, repo)
    if (commits.length === 0) {
      return res
        .status(404)
        .json({ error: "No commits found — check the repo name and that it's public." })
    }
    const stats = computeStats(commits)
    const persona = computePersona(stats)
    const narrative = await generateNarrative(repo, owner, stats, repoMeta)
    return res.status(200).json({ stats, persona, narrative, repoMeta })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message || 'Something broke analyzing that repo.' })
  }
}

async function fetchCommitsAndMeta(owner, repo) {
  const headers = {
    Accept: 'application/vnd.github+json',
    ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  }

  // Fetch repo metadata (stars, description) in parallel with commits
  const metaPromise = fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers })

  // Up to 300 commits (3 pages of 100) — plenty for rhythm analysis and keeps this fast.
  const commits = []
  for (let page = 1; page <= 3; page++) {
    const r = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits?per_page=100&page=${page}`,
      { headers }
    )
    if (!r.ok) {
      if (r.status === 404) throw new Error("Repo not found — check owner/repo spelling and that it's public.")
      if (r.status === 403) throw new Error('GitHub rate limit hit — add a GITHUB_TOKEN in your environment.')
      throw new Error(`GitHub API error: ${r.status}`)
    }
    const batch = await r.json()
    commits.push(...batch)
    if (batch.length < 100) break
  }

  // Resolve repo metadata (best-effort — don't fail if it 404s)
  let repoMeta = { stars: 0, description: '', language: '', readme: '' }
  try {
    const metaRes = await metaPromise
    if (metaRes.ok) {
      const m = await metaRes.json()
      repoMeta = {
        stars: m.stargazers_count ?? 0,
        description: m.description ?? '',
        language: m.language ?? '',
        readme: '',
      }
    }
  } catch (_) {
    // Non-fatal
  }

  // Fetch README (best-effort, non-blocking)
  try {
    const readmeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/readme`,
      { headers }
    )
    if (readmeRes.ok) {
      const readmeData = await readmeRes.json()
      // GitHub returns base64-encoded content
      const readmeText = Buffer.from(readmeData.content || '', 'base64').toString('utf-8')
      // Truncate to first 1500 chars — enough context without blowing up the prompt
      repoMeta.readme = readmeText.slice(0, 1500)
    }
  } catch (_) {
    // Non-fatal — README is optional
  }

  return { commits, repoMeta }
}

function computeStats(commits) {
  // NOTE: GitHub's API normalizes commit.author.date to UTC. We use a configurable
  // timezone offset so "late night" reads feel honest for the repo's primary author.
  // Default: IST (UTC+5:30). Adjust TIMEZONE_OFFSET_MIN if your demo repo is elsewhere.
  const TIMEZONE_OFFSET_MIN = 330 // IST = UTC+5:30

  const hourCounts = new Array(24).fill(0)
  let weekendCount = 0
  const dateSet = new Set()
  const messages = []
  const weekdayCounts = new Array(7).fill(0)
  
  // 7 days of the week, 24 hours of the day matrix
  const punchCard = Array.from({ length: 7 }, () => new Array(24).fill(0))

  for (const c of commits) {
    const iso = c.commit?.author?.date
    if (!iso) continue
    const utc = new Date(iso)
    const local = new Date(utc.getTime() + TIMEZONE_OFFSET_MIN * 60000)
    const hour = local.getUTCHours()
    const day = local.getUTCDay() // 0 = Sunday
    hourCounts[hour]++
    weekdayCounts[day]++
    punchCard[day][hour]++
    if (day === 0 || day === 6) weekendCount++
    dateSet.add(local.toISOString().slice(0, 10))
    const msgText = (c.commit.message || '').split('\n')[0].trim().slice(0, 120)
    if (msgText) {
      messages.push({
        text: msgText,
        date: local.toISOString(),
        hour,
      })
    }
  }

  const total = commits.length
  // Late night: 12am–5am local
  const lateNightCount = hourCounts.slice(0, 5).reduce((a, b) => a + b, 0)
  const busiestHour = hourCounts.indexOf(Math.max(...hourCounts))

  const sortedDates = [...dateSet].sort()
  let longestStreak = 1
  let currentStreak = 1
  let longestGap = 0
  for (let i = 1; i < sortedDates.length; i++) {
    const diffDays = (new Date(sortedDates[i]) - new Date(sortedDates[i - 1])) / 86400000
    if (diffDays === 1) {
      currentStreak++
      longestStreak = Math.max(longestStreak, currentStreak)
    } else {
      currentStreak = 1
      longestGap = Math.max(longestGap, diffDays)
    }
  }

  // Representative sample: first 3 (origin story), last 3 (current mood),
  // longest messages (most descriptive), and any late-night ones (most dramatic).
  const lateNightMsgs = messages.filter((m) => m.hour < 5).slice(0, 4)
  const longest = [...messages].sort((a, b) => b.text.length - a.text.length).slice(0, 6)
  const seen = new Set()
  const sample = []
  for (const m of [...messages.slice(0, 3), ...messages.slice(-3), ...lateNightMsgs, ...longest]) {
    if (!seen.has(m.text)) {
      seen.add(m.text)
      sample.push(m.text)
    }
    if (sample.length >= 15) break
  }

  const HOUR_LABELS = [
    '12am','1am','2am','3am','4am','5am','6am','7am','8am','9am','10am','11am',
    '12pm','1pm','2pm','3pm','4pm','5pm','6pm','7pm','8pm','9pm','10pm','11pm',
  ]

  // Rage-commit detector: look for rapid-fire "fix" / "wtf" / "why" sequences
  const fixWords = /\b(fix|hotfix|actually|oops|wtf|why|argh|revert|undo|broken|broke|stupid|please|god)\b/i
  const rageCommits = messages.filter((m) => fixWords.test(m.text)).length

  return {
    totalCommits: total,
    firstDate: sortedDates[0],
    lastDate: sortedDates[sortedDates.length - 1],
    lateNightPct: Math.round((lateNightCount / total) * 100),
    weekendPct: Math.round((weekendCount / total) * 100),
    busiestHour,
    busiestHourLabel: HOUR_LABELS[busiestHour],
    longestStreak,
    longestGap: Math.round(longestGap),
    hourCounts,
    weekdayCounts,
    punchCard,
    sampleMessages: sample,
    totalDaysActive: sortedDates.length,
    rageCommits,
    ragePct: Math.round((rageCommits / total) * 100),
  }
}

// Derive a persona label from the commit stats.
// Returns { label, emoji, tagline, alignment, alignmentEmoji, alignmentTagline, horoscope, rageMeter }
function computePersona(stats) {
  const { lateNightPct, weekendPct, longestStreak, longestGap, ragePct, busiestHour, totalCommits } = stats

  // Score each archetype and pick the highest
  const scores = [
    {
      label: 'Night Owl',
      emoji: '🦉',
      tagline: 'Does your best work when the rest of the world is asleep.',
      score: lateNightPct * 2 + (busiestHour < 5 ? 30 : 0),
    },
    {
      label: 'Weekend Warrior',
      emoji: '⚔️',
      tagline: 'The 9-to-5 is for other people. You save the real work for Saturday.',
      score: weekendPct * 2.5,
    },
    {
      label: 'Streak Machine',
      emoji: '🔥',
      tagline: `${longestStreak} days straight. Consistency isn't a habit — it's a personality.`,
      score: longestStreak * 3 + (longestGap < 7 ? 20 : 0),
    },
    {
      label: 'Deep Diver',
      emoji: '🌊',
      tagline: 'Long gaps, long bursts. You disappear into a problem and resurface with a solution.',
      score: longestGap > 14 ? longestGap * 2 : 0,
    },
    {
      label: 'Rage Coder',
      emoji: '💢',
      tagline: "The commit history doesn't lie — you feel things deeply, especially bugs.",
      score: ragePct * 4,
    },
    {
      label: 'Daylight Developer',
      emoji: '☀️',
      tagline: 'Structured, disciplined, peak productivity in business hours. Rare.',
      score: busiestHour >= 9 && busiestHour <= 17 && lateNightPct < 10 ? 60 : 0,
    },
    {
      label: 'Prolific Coder',
      emoji: '📚',
      tagline: `${totalCommits} commits and counting. Volume is your love language.`,
      score: totalCommits > 200 ? 70 : totalCommits > 100 ? 40 : 0,
    },
  ]

  scores.sort((a, b) => b.score - a.score)
  const winner = scores[0]
  const runner = scores[1]

  // Calculate Developer Horoscope
  let horoscope = ""
  if (lateNightPct > 30) {
    horoscope = "Your coding zodiac is under the rising sign of the Midnight Mug. A transit of debug logs has entered your house of caffeine, suggesting an imminent system crash or a sudden, brilliant pre-dawn realization."
  } else if (weekendPct > 35) {
    horoscope = "Your coding zodiac is under the sign of the Saturday Sun. Liberated from Slack notifications and meeting invites, your creative nodes are in absolute alignment. An epic side-project epoch is predicted."
  } else if (ragePct > 15) {
    horoscope = "Your coding zodiac is under the sign of the Smoke-Spewing Keyboard. The ascendant of unhelpful compiler errors indicates high spite levels. Step away from the computer, drink some water, and let the force push resolve itself."
  } else if (longestStreak > 5) {
    horoscope = "Your coding zodiac is under the sign of the Unbroken Green Square. The momentum stars predict that skipping a day now would disrupt the subtle flow of your git timeline. Keep pushing commits to stay in cosmic balance."
  } else {
    horoscope = "Your coding zodiac is under the sign of the Balanced Branch. You do not let Git dictate your circadian rhythm. The stars predict a peaceful, conflict-free merge request in your immediate future."
  }

  // Calculate Developer Alignment (D&D style)
  let alignment = "True Neutral"
  let alignmentEmoji = "☯️"
  let alignmentTagline = "You commit when you need to, sleep when you want to, and don't overthink the git log."

  if (busiestHour >= 9 && busiestHour <= 17 && lateNightPct < 5 && weekendPct < 10 && ragePct < 5) {
    alignment = "Lawful Good"
    alignmentEmoji = "👼"
    alignmentTagline = "You comment your code, write unit tests, and log off at 5 PM. Your mental health is remarkably intact."
  } else if (lateNightPct > 25 && weekendPct > 20 && ragePct > 15) {
    alignment = "Chaotic Evil"
    alignmentEmoji = "👺"
    alignmentTagline = "You code at 3 AM fueled by spite, pushing experimental hotfixes directly to main without testing."
  } else if (weekendPct < 15 && lateNightPct < 10 && ragePct > 15) {
    alignment = "Lawful Evil"
    alignmentEmoji = "😈"
    alignmentTagline = "A productive corporate executioner who gets the tickets resolved, but harbors pure hatred for the codebase."
  } else if (weekendPct > 25 && ragePct < 8 && longestStreak > 4) {
    alignment = "Chaotic Good"
    alignmentEmoji = "🦄"
    alignmentTagline = "An open-source champion who constructs beautiful things for free in the quiet hours of Sunday morning."
  } else if (longestGap > 14 && lateNightPct > 15) {
    alignment = "Chaotic Neutral"
    alignmentEmoji = "👻"
    alignmentTagline = "You vanish into the shadows for weeks, only to emerge at 4 AM to rewrite the entire project architecture."
  } else if (longestStreak > 6 && ragePct < 10) {
    alignment = "Neutral Good"
    alignmentEmoji = "🛡️"
    alignmentTagline = "A reliable builder who keeps the project moving forward, square by square, with zero drama."
  }

  // Compute Rage Level (0 to 100)
  let rageLevel = Math.min(100, Math.round(ragePct * 3.5))
  let rageLabel = "Zen Coder"
  let rageEmoji = "🧘"
  
  if (rageLevel > 70) {
    rageLabel = "Unhinged Destroyer"
    rageEmoji = "🌋"
  } else if (rageLevel > 40) {
    rageLabel = "Keyboard Slammer"
    rageEmoji = "⌨️"
  } else if (rageLevel > 15) {
    rageLabel = "Mildly Irritated"
    rageEmoji = "☕"
  }

  return {
    label: winner.label,
    emoji: winner.emoji,
    tagline: winner.tagline,
    runnerUp: { label: runner.label, emoji: runner.emoji },
    alignment,
    alignmentEmoji,
    alignmentTagline,
    horoscope,
    rageMeter: {
      level: rageLevel,
      label: rageLabel,
      emoji: rageEmoji
    }
  }
}

async function generateNarrative(repo, owner, stats, repoMeta) {
  const readmeExcerpt = repoMeta?.readme
    ? `\n\nREADME EXCERPT (use this to understand what the project actually does):\n${repoMeta.readme}`
    : ''

  const prompt = `You are a sharp, slightly wry writer who profiles developers based purely on their git commit history — think the tone of a New Yorker profile crossed with a movie trailer voiceover. Perceptive. A little dramatic. Specific.

Given the commit data below for "${owner}/${repo}", write a short narrative about the passion story hiding in this commit history. Tell the developer their own story back to them, the way only their git log can.

RULES (follow all of them):
- 180–250 words. No more.
- Second person ("you"), intimate and direct.
- Reference at least 3 SPECIFIC details from the data: quote an actual commit message, name the exact busiest hour, call out the exact streak or gap length.
- Avoid all clichés: "shows dedication", "hard work", "journey of growth", "passion shines through". You're better than that.
- Be specific enough that the developer would recognize themselves. Generic is the enemy.
- The verdict must be one single sharp sentence — a line they'd want to screenshot.
- Provide a highly descriptive, single-sentence imagePrompt. READ the README excerpt carefully to understand the project's purpose, then describe a beautiful abstract tech illustration that visually represents what the project ACTUALLY does. For example: if a project is a collaborative editor, show glowing cursors editing a shared document; if it's a chat app, show glowing message bubbles flowing between nodes. Be literal about the project's core function, not generic. End the prompt with ", digital art, dark background, neon glow, 4k".

Return ONLY valid JSON with no markdown fences:
{"title": "...", "narrative": "...", "verdict": "...", "imagePrompt": "..."}

COMMIT DATA:
Repository: ${owner}/${repo}
Description: ${repoMeta?.description || 'N/A'}
Language: ${repoMeta?.language || 'N/A'}
Total commits analyzed: ${stats.totalCommits}
Active days: ${stats.totalDaysActive}
Date range: ${stats.firstDate} to ${stats.lastDate}
Peak coding hour: ${stats.busiestHourLabel} (${stats.busiestHour}:00)
Late-night commits (12am–5am): ${stats.lateNightPct}%
Weekend commits: ${stats.weekendPct}%
Longest daily streak: ${stats.longestStreak} consecutive days
Longest gap between commits: ${stats.longestGap} days
Sample commit messages (real, verbatim): ${JSON.stringify(stats.sampleMessages)}${readmeExcerpt}`

  // Try models in order — each has its own free-tier quota bucket.
  // gemini-2.5-flash is the latest and most capable; 2.0-flash and 2.0-flash-lite are fallbacks.
  const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite']

  let lastError = null
  for (const model of MODELS) {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 600,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                title: { type: 'STRING' },
                narrative: { type: 'STRING' },
                verdict: { type: 'STRING' },
                imagePrompt: { type: 'STRING' },
              },
              required: ['title', 'narrative', 'verdict', 'imagePrompt'],
            },
          },
        }),
      }
    )

    // On quota exhaustion or server error, try the next model
    if (r.status === 429 || r.status === 503) {
      const body = await r.text()
      lastError = `Gemini ${model} error ${r.status}: ${body}`
      console.warn(`[analyze] ${model} quota hit, trying next model…`)
      continue
    }

    if (!r.ok) {
      const errBody = await r.text()
      throw new Error(`Gemini API error ${r.status}: ${errBody}`)
    }

    const data = await r.json()
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'

    // Strip any markdown fences Gemini occasionally adds despite instructions
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()

    // Find the first { and last } to extract just the JSON object
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    const jsonStr = start !== -1 && end !== -1 ? cleaned.slice(start, end + 1) : cleaned

    try {
      return JSON.parse(jsonStr)
    } catch {
      return { title: 'Commit Confession', narrative: raw, verdict: '' }
    }
  }

  // All models exhausted
  throw new Error(
    'All Gemini models hit their quota. Wait a minute and try again, or add billing at console.cloud.google.com. Last error: ' + lastError
  )
}
