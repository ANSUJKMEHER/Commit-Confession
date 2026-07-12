# Commit Confessions

> Your git history, read back to you like a confession.

Feed it a public GitHub repo. It pulls the commit history — timestamps, streaks, late-night patterns, message samples — and sends the data through Gemini to produce a short, honest narrative about the coding passion hiding in those commits. Optionally, ElevenLabs narrates it back like a movie trailer.

**Built for DEV Weekend Challenge: Passion Edition (July 2026)**

---

## Live Demo

→ [commit-confessions.vercel.app](https://commit-confessions.vercel.app)

---

## How it works

```
GitHub REST API  →  pattern analysis  →  Gemini 2.0 Flash  →  narrative
                                                     ↘  ElevenLabs (optional voiceover)
```

1. **GitHub API**: fetches up to 300 commits (no auth needed for public repos, but adding a token raises the rate limit from 60 to 5,000 requests/hr)
2. **`api/analyze.js`** (Vercel serverless): computes stats — hourly distribution, late-night %, weekend %, streak/gap lengths, sample messages — then calls Gemini
3. **Gemini 2.0 Flash**: one well-crafted prompt → `{ title, narrative, verdict }` JSON
4. **`api/narrate.js`** (Vercel serverless): proxies text to ElevenLabs TTS (keeps the API key server-side)
5. **Frontend**: Vite + React, D3 radial clock visualization, progressive narrative reveal, shareable URL hash

---

## Local development

### 1. Clone and install

```bash
git clone https://github.com/YOUR_HANDLE/commit-confessions
cd commit-confessions
npm install
```

### 2. Set up environment variables

Copy `.env.example` to `.env` and fill in your keys:

```bash
cp .env.example .env
```

```env
GEMINI_API_KEY=your_gemini_key_here
GITHUB_TOKEN=your_github_pat_here          # optional but strongly recommended
ELEVENLABS_API_KEY=your_elevenlabs_key     # optional — needed for audio narration
ELEVENLABS_VOICE_ID=JBFqnCBsd6RMkjVDRZzb  # "George" — deep narrator voice
```

**Where to get keys:**
- Gemini: [aistudio.google.com](https://aistudio.google.com) → Get API Key (free tier is plenty)
- GitHub PAT: Settings → Developer Settings → Personal access tokens → Fine-grained → read:contents on public repos
- ElevenLabs: [elevenlabs.io](https://elevenlabs.io) → Profile → API Keys (free tier has 10k chars/month)

### 3. Run locally

```bash
npm run dev
```

This uses `vercel dev` which runs both the Vite frontend and the `api/` serverless functions together on `http://localhost:3000`.

> **First run**: Vercel CLI will prompt you to link the project. Choose "No" to create a new project or link your existing Vercel project.

---

## Deployment (Vercel)

```bash
vercel deploy --prod
```

Add your environment variables in the Vercel dashboard under **Settings → Environment Variables**.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 5, D3 v7 |
| Serverless | Vercel Functions (Node.js ESM) |
| AI narrative | Google Gemini 2.0 Flash |
| AI voiceover | ElevenLabs TTS (eleven_flash_v2_5) |
| Data source | GitHub REST API v3 |
| Fonts | Fraunces (serif) + JetBrains Mono |

---

## Project structure

```
commit-confessions/
├── api/
│   ├── analyze.js     # GitHub fetch + stats + Gemini narrative
│   └── narrate.js     # ElevenLabs TTS proxy
├── src/
│   ├── App.jsx        # Main app, state, URL hash sharing
│   ├── index.css      # Full design system
│   ├── main.jsx       # React entry point
│   └── components/
│       ├── CommitClock.jsx   # D3 radial hour-of-day visualization
│       └── StatCard.jsx      # Individual stat tile
├── index.html         # SEO + OG tags
└── vite.config.js     # Vite config
```

---

## Try it on these repos

| Repo | What to expect |
|---|---|
| `torvalds/linux` | 50k+ commits, extreme late-night density |
| `antirez/redis` | Solo author passion project with vivid commit messages |
| Your own repo | Whatever you've been obsessed with |

---

## Prizes targeted

- ✦ **Best Use of Google AI** — Gemini 2.0 Flash is the narrative core
- ♪ **Best Use of ElevenLabs** — voiceover narration bolt-on

---

*All submissions and code were created within the challenge window (July 10–13, 2026).*
