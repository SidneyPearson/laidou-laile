import type { RouteRequestOutcome } from '../composables/useRouteRequest'

export function shouldPersistGeneratedRoutes(
  outcome: RouteRequestOutcome,
  routes: ArrayLike<unknown> | null | undefined,
): boolean {
  return outcome === 'success' && routes != null && routes.length > 0
}
