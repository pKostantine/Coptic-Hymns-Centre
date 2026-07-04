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
