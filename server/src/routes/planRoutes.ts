import { Router, type Request, type Response, type NextFunction } from 'express'
import type { GenerateRoutesResponse } from '../types/route.js'
import { generateRoutes } from '../services/routeGenerator.js'
import { refinePlan, replaceStop } from '../services/aiPlannerService.js'

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
    const { lat, lng, timeOption, distance, preferences, cuisineTypes, scenicTypes, wanderTypes, customCuisine, customScenic, customWander } = req.body

    if (lat == null || lng == null || timeOption == null || distance == null || !preferences?.length) {
      res.status(400).json({
        error: { code: 'INVALID_PARAMS', message: '请提供位置、时间、距离和至少一个偏好' },
      })
      return
    }

    // Merge custom strings into type arrays so the backend treats them as additional keywords
    const mergedCuisine = [...(cuisineTypes || []), ...(customCuisine || [])]
    const mergedScenic = [...(scenicTypes || []), ...(customScenic || [])]
    const mergedWander = [...(wanderTypes || []), ...(customWander || [])]

    const result = await generateRoutes({ lat, lng, timeOption, distance, preferences, cuisineTypes: mergedCuisine, scenicTypes: mergedScenic, wanderTypes: mergedWander })

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

router.post(
  '/replace-stop',
  asyncHandler(async (req, res) => {
    const { route, stopIndex, preferences, distance, adcode } = req.body

    if (!route || !route.stops?.length || typeof stopIndex !== 'number' || !route.stops[stopIndex]) {
      res.status(400).json({
        error: { code: 'INVALID_PARAMS', message: '请提供有效的路线和要替换的地点' },
      })
      return
    }

    const replaced = await replaceStop({
      route,
      stopIndex,
      preferences: Array.isArray(preferences) && preferences.length ? preferences : ['food'],
      distance: typeof distance === 'number' ? distance : 0,
      adcode,
    })

    if (!replaced) {
      res.status(404).json({
        error: { code: 'NO_REPLACEMENT', message: '附近没有更多同类地点了' },
      })
      return
    }

    res.setHeader('Cache-Control', 'no-store')
    res.json({ route: replaced })
  }),
)

export default router
