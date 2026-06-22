import { Router, type Request, type Response, type NextFunction } from 'express'
import type { GenerateRoutesResponse } from '../types/route.js'
import { generateRoutes } from '../services/routeGenerator.js'
import { refinePlan } from '../services/aiPlannerService.js'

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
    const { lat, lng, timeOption, distance, preferences, cuisineTypes, scenicTypes, wanderTypes } = req.body

    if (lat == null || lng == null || timeOption == null || distance == null || !preferences?.length) {
      res.status(400).json({
        error: { code: 'INVALID_PARAMS', message: '请提供位置、时间、距离和至少一个偏好' },
      })
      return
    }

    const result = await generateRoutes({ lat, lng, timeOption, distance, preferences, cuisineTypes, scenicTypes, wanderTypes })

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

router.post(
  '/refine',
  asyncHandler(async (req, res) => {
    const { route, removeStopIndices, extraRequirements, city, weather, timeMinutes, distance } = req.body

    if (!route || !route.stops?.length) {
      res.status(400).json({
        error: { code: 'INVALID_PARAMS', message: '请提供需要优化的路线' },
      })
      return
    }

    const refined = await refinePlan({
      route,
      removeStopIndices: removeStopIndices || [],
      extraRequirements,
      position: route.stops[0]
        ? { lat: route.stops[0].lat, lng: route.stops[0].lng }
        : { lat: 0, lng: 0 },
      city: city || '',
      weather: weather || '晴',
      timeMinutes: timeMinutes || 240,
      distance: distance || 0,
    })

    if (!refined) {
      res.status(404).json({
        error: { code: 'REFINE_FAILED', message: '路线优化失败，请重试' },
      })
      return
    }

    res.setHeader('Cache-Control', 'no-store')
    res.json({ routes: [refined] })
  }),
)

export default router
