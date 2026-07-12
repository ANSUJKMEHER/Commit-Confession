// Local dev server: runs the api/ handlers as Express routes.
// Usage: node server.js
// This is only needed locally — production still uses Vercel's serverless functions.

import 'dotenv/config'
import express from 'express'
import { createServer as createViteServer } from 'vite'

const app = express()
app.use(express.json())

// Dynamically import each api handler and adapt it to Express
async function loadHandler(name) {
  const mod = await import(`./api/${name}.js?update=${Date.now()}`)
  return mod.default
}

app.post('/api/analyze', async (req, res) => {
  const handler = await loadHandler('analyze')
  return handler(req, res)
})

app.post('/api/narrate', async (req, res) => {
  const handler = await loadHandler('narrate')
  return handler(req, res)
})

app.post('/api/solana-register', async (req, res) => {
  const handler = await loadHandler('solana-register')
  return handler(req, res)
})

// Vite dev server for the frontend
const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: 'spa',
})
app.use(vite.middlewares)

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`\n  🚀  Commit Confessions running at http://localhost:${PORT}\n`)
})
