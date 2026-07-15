// Compatibility barrel: this file was 1835 lines. It has been split under
// `services/planner/`. Consumers can keep importing from here — every public
// name (types + functions) is re-exported below with identical signatures.
//
// If you touch planner internals, edit the files in `./planner/` directly.
export type {
  PlanInput,
  PlanOutput,
  RefineInput,
  ReplaceStopInput,
} from './planner/index.js'
export {
  generatePlan,
  refinePlan,
  replaceStop,
  buildFallbackRoutes,
  extractCuisineKeyword,
  estimateWalkDistFromStops,
} from './planner/index.js'
