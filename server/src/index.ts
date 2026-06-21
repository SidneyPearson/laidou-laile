import express from 'express'
import cors from 'cors'
import { env } from './config/env.js'
import { errorHandler } from './middleware/errorHandler.js'
import planRoutes from './routes/planRoutes.js'

const app = express()

app.use(cors({ origin: env.CORS_ORIGIN }))
app.use(express.json())

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

// Routes
app.use('/api/plan', planRoutes)

// Error handler
app.use(errorHandler)

app.listen(env.PORT, () => {
  console.log(`🏙️  来都来了 server running at http://localhost:${env.PORT}`)
  console.log(`   POST /api/plan/generate`)
})
