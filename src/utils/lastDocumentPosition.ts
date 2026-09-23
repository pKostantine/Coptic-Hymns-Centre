// Remembers, per document, the last section the user was looking at — a
// plain module-level store (not React state) because navigating to Settings
// and back unmounts the document screen (React Navigation doesn't keep
// screens outside the visible stack mounted on web), which would otherwise
// wipe any in-component position memory right when it's needed most.
const lastPositionByDocument = new Map<string, string>();

export function getLastDocumentPosition(key: string): string | undefined {
  return lastPositionByDocument.get(key);
}

export function setLastDocumentPosition(key: string, sectionId: string): void {
  lastPositionByDocument.set(key, sectionId);
}

/** Preserve the ORIGINAL reading position/order across Settings or Calendar
 * route unmounts and asynchronous service rehydration. A snapshot is frozen
 * until that route returns, even if the user makes several changes there. */
export interface PendingDocumentRestore {
  sequence: number;
  revision: number;
  sectionId: string;
  originalSectionIds: string[];
  dirty: boolean;
}
const pendingRestores = new Map<string, PendingDocumentRestore>();
let nextRestoreSequence = 0;

export function captureDocumentRestore(key: string, sectionId: string | null | undefined, sectionIds: readonly string[]): void {
  if (pendingRestores.has(key) || !sectionId || !sectionIds.length) return;
  pendingRestores.set(key, {
    sequence: ++nextRestoreSequence,
    revision: 0,
    sectionId,
    originalSectionIds: [...sectionIds],
    dirty: false,
  });
  // Use the frozen position until it is deliberately restored. A WebView
  // that reflows behind Settings must not overwrite it with a stray report.
  setLastDocumentPosition(key, sectionId);
}

export function markPendingDocumentRestoresDirty(): void {
  pendingRestores.forEach(snapshot => {
    snapshot.dirty = true;
    snapshot.revision += 1;
  });
}

export function getPendingDocumentRestore(key: string): PendingDocumentRestore | undefined {
  return pendingRestores.get(key);
}

export function clearPendingDocumentRestore(key: string, sequence: number): void {
  if (pendingRestores.get(key)?.sequence === sequence) pendingRestores.delete(key);
}
