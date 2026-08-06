export const STUDIO_PHASES = ['brief', 'write', 'produce', 'review'] as const;

export type StudioPhase = (typeof STUDIO_PHASES)[number];

export type StudioWriteFocusIntent = {
  sceneId: string;
  field: 'visualPrompt';
};

export type StudioPhaseTransition = {
  phase: StudioPhase;
  state?: { writeFocus?: StudioWriteFocusIntent };
};

const phaseStorageKey = (projectId: string): string => `aionui:creative-studio:last-phase:${projectId}`;

const resolveStorage = (storage?: Storage): Storage | null => {
  if (storage !== undefined) return storage;
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

export function parseStudioPhase(value: string | undefined): StudioPhase | null {
  return STUDIO_PHASES.find((phase) => phase === value) ?? null;
}

export function studioPhasePath(projectId: string, phase: StudioPhase): string {
  return `/studio/${encodeURIComponent(projectId)}/${phase}`;
}

export function defaultStudioPhase(sceneCount: number): StudioPhase {
  return sceneCount === 0 ? 'brief' : 'write';
}

export function readLastStudioPhase(projectId: string, storage?: Storage): StudioPhase | null {
  try {
    return parseStudioPhase(resolveStorage(storage)?.getItem(phaseStorageKey(projectId)) ?? undefined);
  } catch {
    return null;
  }
}

export function rememberStudioPhase(projectId: string, phase: StudioPhase, storage?: Storage): void {
  try {
    resolveStorage(storage)?.setItem(phaseStorageKey(projectId), phase);
  } catch {
    // Phase persistence is a best-effort renderer-local enhancement.
  }
}

export function resolveStudioEntryPhase(projectId: string, sceneCount: number, storage?: Storage): StudioPhase {
  return readLastStudioPhase(projectId, storage) ?? defaultStudioPhase(sceneCount);
}
