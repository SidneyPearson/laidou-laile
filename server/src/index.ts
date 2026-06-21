import express from 'express'
import cors from 'cors'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { env } from './config/env.js'
import { errorHandler } from './middleware/errorHandler.js'
import planRoutes from './routes/planRoutes.js'

const app = express()
const __dirname = dirname(fileURLToPath(import.meta.url))

app.use(cors({ origin: env.CORS_ORIGIN }))
app.use(express.json())

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

// API Routes
app.use('/api/plan', planRoutes)

// ── Serve frontend static files ──────────────────────
const distPath = resolve(__dirname, '../../client/dist')
app.use(express.static(distPath))

// SPA fallback: all non-API routes → index.html
app.get('*', (_req, res) => {
  res.sendFile(resolve(distPath, 'index.html'))
})

// Error handler
app.use(errorHandler)

app.listen(env.PORT, () => {
  console.log(`🏙️  来都来了 server running at http://localhost:${env.PORT}`)
  console.log(`   Frontend: distPath = ${distPath}`)
  console.log(`   POST /api/plan/generate`)
})
