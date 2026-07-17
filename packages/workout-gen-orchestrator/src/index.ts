/**
 * Server-only workout generation orchestrator.
 *
 * Responsibilities:
 * - validate the structured request
 * - load and map the user's training profile
 * - load and map the exercise catalog
 * - construct the deterministic workout-engine input
 * - invoke the deterministic workout engine
 * - apply the prescription layer (rep/RIR/rest)
 * - map the engine result to a browser-safe review DTO
 * - emit controlled observability events
 *
 * This package is server-only. It must never be imported into the browser bundle.
 */

export * from './orchestrator.js';
export * from './contracts.js';
export * from './prescription.js';
export * from './validation.js';
export * from './profile-mapping.js';
export * from './catalog-mapping.js';
export * from './result-mapping.js';
export * from './engine-input.js';
export * from './observability.js';
export { packageName } from './package-name.js';