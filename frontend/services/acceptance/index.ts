// Public entry point for the Live Multi-Device Acceptance Framework.

export { acceptanceOrchestrator } from './orchestrator';
export type { AcceptanceReport, ScenarioResult, ScenarioContext } from './orchestrator';
export { acceptanceApi } from './api';
export { scenarios, drainQueue, setHandoff, waitHandoff } from './scenarios';
export { cleanupRun } from './cleanup';
export { downloadReport, downloadMarkdown, downloadHtml, renderMarkdown, renderHtml } from './report';
export { getDeviceId, getDeviceLabel } from './device';
export { setQueueSnapshotHook, refreshQueueSnapshot, startTimer, currentQueueSnapshot } from './telemetry';
export { check, warn, verdictFromChecks, mergeChecks, isNumericWithin, statusOf } from './verify';
export { SCENARIO_PLAN, PRODUCTION_ACCEPTANCE_CRITERIA, ACCEPTANCE_TAG, ACCEPTANCE_COMPANY, ACCEPTANCE_FY } from './types';
export type { CheckResult, CheckStatus, ScenarioMeta, TelemetryPoint, Verdict, EnvironmentMeta, AcceptanceRun } from './types';
