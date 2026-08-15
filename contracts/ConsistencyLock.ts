/**
 * @file ConsistencyLock.ts
 * @description Interfaces for the ERP Consistency Lock system.
 * Guarantees that the document rendered on screen is identical to the one exported.
 */

import { RenderModel } from './RenderModel';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  fingerprint: string; // The SHA-256 hash of the render tree
}

export interface PreFlightManifest {
  renderModel: RenderModel;
  lock: ValidationResult;
  timestamp: string;
}

export interface ConsistencyConfig {
  strictMode: boolean; // If true, warnings are treated as errors
  checkOverlaps: boolean;
  checkPageBoundaries: boolean;
}
