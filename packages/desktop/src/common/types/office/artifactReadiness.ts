/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type PresentationArtifactIdentity = {
  readonly sha256: string;
  readonly byteLength: number;
};

export type PresentationVisualAnchorKind = 'picture' | 'chart' | 'table' | 'connector';

export type PresentationSlideRole = 'cover' | 'divider' | 'quote' | 'closing' | 'minimal' | 'content';

export type PresentationReadinessBlockerCode =
  | 'STRUCTURAL_VALIDATION_FAILED'
  | 'EVIDENCE_MISSING'
  | 'EVIDENCE_STALE'
  | 'PLAN_INVALID'
  | 'SOURCE_REF_UNRESOLVED'
  | 'LITERAL_ESCAPE_TOKEN'
  | 'UNRESOLVED_PLACEHOLDER'
  | 'REQUIRED_NOTES_MISSING'
  | 'CONTENT_VISUAL_ANCHOR_MISSING'
  | 'OOXML_UNSAFE'
  | 'RENDER_MISSING'
  | 'RENDER_LIMIT_EXCEEDED'
  | 'RENDER_TIMEOUT'
  | 'HASH_MISMATCH';

export type PresentationReadinessBlocker = {
  readonly code: PresentationReadinessBlockerCode;
  readonly slideNumber: number | null;
};

export type PresentationPlanEvidence = {
  readonly valid: boolean;
  readonly slideCount: number;
  readonly sourceRefCount: number;
};

export type PresentationSlidePolicyEvidence = {
  readonly slideNumber: number;
  readonly role: PresentationSlideRole;
  readonly sourceRefs: readonly string[];
  readonly requiresNotes: boolean;
  readonly requiresVisualAnchor: boolean;
};

/** Mechanical policy evidence only. It grants no lifecycle transition or user action. */
export type PresentationReadinessPolicyEvidence = {
  readonly version: 1;
  readonly plan: PresentationPlanEvidence;
  readonly slides: readonly PresentationSlidePolicyEvidence[];
  readonly blockers: readonly PresentationReadinessBlocker[];
};

export type PresentationReadinessOoxmlSlideEvidence = {
  readonly slideNumber: number;
  readonly shapeCount: number;
  readonly textCharCount: number;
  readonly textOnlyShapeCount: number;
  readonly notesTextCharCount: number;
  readonly visualAnchorKinds: readonly PresentationVisualAnchorKind[];
};

export type PresentationReadinessOoxmlEvidence = {
  readonly zipEntryCount: number;
  readonly expandedByteLength: number;
  readonly xmlByteLength: number;
  readonly slideCount: number;
  readonly totalTextChars: number;
  readonly slides: readonly PresentationReadinessOoxmlSlideEvidence[];
};

export type PresentationSlideRenderEvidence = {
  readonly slideNumber: number;
  readonly candidateSha256: string;
  readonly sha256: string;
  readonly byteLength: number;
};

export type PresentationReadinessHashChain = {
  readonly stagingBeforeRetain: string;
  readonly retainedTemp: string;
  readonly stagingAfterRetain: string;
  readonly manifestRetained: string;
  readonly inspectionCopy: string;
  readonly retainedAfterStructuralValidation: string;
  readonly retainedAfterOoxmlInspection: string;
  readonly retainedAfterEachSlideRender: readonly string[];
};

/** Path-free inspection evidence. Task 8 remains the sole authorization and persistence owner. */
export type PresentationReadinessEvidence = {
  readonly version: 1;
  readonly candidate: PresentationArtifactIdentity;
  readonly plan: PresentationArtifactIdentity;
  readonly hashChain: PresentationReadinessHashChain;
  readonly structure: { readonly officeCliValidated: true };
  readonly ooxml: PresentationReadinessOoxmlEvidence;
  readonly policy: PresentationReadinessPolicyEvidence;
  readonly renders: readonly PresentationSlideRenderEvidence[];
};
