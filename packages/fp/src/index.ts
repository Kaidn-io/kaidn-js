export {
  collect,
  beacon,
  watch,
  type CollectOptions,
  type WatchOptions,
  type WatchHandle,
} from "./collect.js";
export {
  createTracker,
  type Tracker,
  type TrackerDeps,
  type TrackerDom,
  type TrackerElement,
  type TrackerEvent,
  type TrackerPayload,
  type TrackerResult,
} from "./tracker.js";
export { detectAutomation, type AutomationInput, type AutomationResult } from "./automation.js";
export { checkUaConsistency, type ConsistencyInput, type ConsistencyResult } from "./consistency.js";
export { detectNoiseInjection, type NoiseInput } from "./noise.js";
export { detectTamper, type TamperInput, type TamperProbe, type TamperResult } from "./tamper.js";
export { compareContexts, type ContextSnapshot, type ContextResult } from "./context.js";
export { flattenComponents, pickWebglRenderer, type ComponentTree } from "./components.js";
export { parseUserAgent, type UaAttributes } from "./useragent.js";
export type { FpResult, FpDeviceSignals, FpAttributes } from "./types.js";
