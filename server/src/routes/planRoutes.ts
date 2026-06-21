import { Router, type Request, type Response, type NextFunction } from 'express'
import type { GenerateRoutesResponse } from '../types/route.js'
import { generateRoutes } from '../services/routeGenerator.js'

const router = Router()

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next)
  }
}

router.post(
  '/generate',
  asyncHandler(async (req, res) => {
    const { lat, lng, timeOption, distance, preferences, mealTypes, cuisineTypes, photoTypes, scenicTypes, wanderTypes, walkLevel } = req.body

    if (lat == null || lng == null || !timeOption || !distance || !preferences?.length) {
      res.status(400).json({
        error: { code: 'INVALID_PARAMS', message: '请提供位置、时间、距离和至少一个偏好' },
      })
      return
    }

    const result = await generateRoutes({ lat, lng, timeOption, distance, preferences, mealTypes, cuisineTypes, photoTypes, scenicTypes, wanderTypes, walkLevel })

    if (result.routes.length === 0) {
      res.status(404).json({
        error: { code: 'NO_POIS_FOUND', message: '附近暂未找到合适的地点' },
      })
      return
    }

    const response: GenerateRoutesResponse & { source: string; fallbackReason: string | null } = {
      routes: result.routes,
      generatedAt: new Date().toISOString(),
      weatherNote: result.weatherNote,
      weather: result.weather,
      locationName: result.locationName,
      source: result.source,
      fallbackReason: result.fallbackReason,
    }

    res.setHeader('Cache-Control', 'no-store')
    res.json(response)
  }),
)

export default router
