/**
 * @file DocumentLifecycle.ts
 * @description Strict document lifecycle and transition rules for a clean ERP system.
 */

import { DocumentState, DocumentType } from './DocumentContract';

/**
 * Transition actions that trigger a state change.
 */
export type LifecycleAction = 
  | 'SAVE_DRAFT'      // Create or update a draft
  | 'SUBMIT'          // Move from DRAFT to PENDING_REVIEW
  | 'APPROVE'         // Move from PENDING_REVIEW to APPROVED
  | 'REJECT'          // Move from PENDING_REVIEW back to DRAFT
  | 'POST'            // Move from APPROVED to FINALIZED (GL impact)
  | 'VOID'            // Move from any state (except CLOSED) to CANCELLED
  | 'CLOSE'           // Move from FINALIZED to CLOSED
  | 'REVISE';         // Create a new version from a FINALIZED/CANCELLED document

/**
 * Definition of a valid transition in the system.
 */
export interface StateTransition {
  from: DocumentState | 'START';
  to: DocumentState;
  action: LifecycleAction;
  requiredRole?: string[];    // Role-based access control for this transition
  isImmutabilityTrigger?: boolean; // If true, the target state is immutable
}

/**
 * Global Transition Matrix for the ERP.
 */
export const DOCUMENT_TRANSITIONS: StateTransition[] = [
  { from: 'START', to: 'DRAFT', action: 'SAVE_DRAFT' },
  { from: 'DRAFT', to: 'DRAFT', action: 'SAVE_DRAFT' },
  { from: 'DRAFT', to: 'PENDING_REVIEW', action: 'SUBMIT' },
  { from: 'PENDING_REVIEW', to: 'APPROVED', action: 'APPROVE', requiredRole: ['Manager', 'Admin'] },
  { from: 'PENDING_REVIEW', to: 'DRAFT', action: 'REJECT', requiredRole: ['Manager', 'Admin'] },
  { from: 'APPROVED', to: 'FINALIZED', action: 'POST', isImmutabilityTrigger: true },
  { from: 'FINALIZED', to: 'CLOSED', action: 'CLOSE' },
  
  // Voiding logic: Can void from almost anywhere, but it's a terminal state
  { from: 'DRAFT', to: 'CANCELLED', action: 'VOID' },
  { from: 'PENDING_REVIEW', to: 'CANCELLED', action: 'VOID', requiredRole: ['Manager', 'Admin'] },
  { from: 'APPROVED', to: 'CANCELLED', action: 'VOID', requiredRole: ['Manager', 'Admin'] },
  { from: 'FINALIZED', to: 'CANCELLED', action: 'VOID', requiredRole: ['Admin'], isImmutabilityTrigger: true },
];

/**
 * Immutability Rules: Defines which states allow modifications to the payload.
 */
export const IMMUTABILITY_RULES: Record<DocumentState, boolean> = {
  'DRAFT': false,           // Fully editable
  'PENDING_REVIEW': true,   // Locked during review
  'APPROVED': true,         // Locked once approved
  'FINALIZED': true,        // Permanently locked (GL impacted)
  'CANCELLED': true,        // Permanently locked
  'CLOSED': true,           // Permanently locked
};

/**
 * Audit Log structure for lifecycle events.
 */
export interface LifecycleAuditEntry {
  timestamp: string;
  documentUid: string;
  version: number;
  action: LifecycleAction;
  fromState: DocumentState | 'START';
  toState: DocumentState;
  userId: string;
  reason?: string;          // Required for REJECT or VOID
  payloadHash: string;      // SHA-256 of the document payload at this point
}

/**
 * Versioning Strategy:
 * 1. DRAFT/PENDING_REVIEW/APPROVED: Version is typically 1 (overwritten on save).
 * 2. VOID/REVISE: Triggers a new version record.
 * 3. FINALIZED documents can NEVER be updated. They must be VOIDED and REVISED (creating version n+1).
 */
export interface VersionControl {
  currentVersion: number;
  history: {
    version: number;
    snapshotUid: string; // Reference to a historical record in a separate table/collection
    createdAt: string;
    createdBy: string;
  }[];
}
