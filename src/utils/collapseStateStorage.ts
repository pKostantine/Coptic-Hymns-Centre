import { Platform } from 'react-native';

type CollapseStatesBySection = Record<string, boolean>;
type CollapseStatesByDocument = Record<string, CollapseStatesBySection>;

const STORAGE_KEY = 'chc-collapsed-sections';

let cachedStates: CollapseStatesByDocument | null = null;
let loadPromise: Promise<CollapseStatesByDocument> | null = null;
let writeQueue = Promise.resolve();

function sanitizeStoredStates(value: unknown): CollapseStatesByDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const sanitized: CollapseStatesByDocument = {};
  for (const [documentKey, sectionStates] of Object.entries(value)) {
    if (!sectionStates || typeof sectionStates !== 'object' || Array.isArray(sectionStates)) continue;
    const validSectionStates = Object.fromEntries(
      Object.entries(sectionStates).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'),
    );
    if (Object.keys(validSectionStates).length) sanitized[documentKey] = validSectionStates;
  }
  return sanitized;
}

async function loadAllCollapseStates(): Promise<CollapseStatesByDocument> {
  if (cachedStates) return cachedStates;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      let raw: string | null = null;
      if (Platform.OS === 'web') {
        raw = window.localStorage.getItem(STORAGE_KEY);
      } else {
        const FileSystem = await import('expo-file-system/legacy');
        const fileUri = `${FileSystem.documentDirectory}${STORAGE_KEY}.json`;
        const info = await FileSystem.getInfoAsync(fileUri);
        if (info.exists) raw = await FileSystem.readAsStringAsync(fileUri);
      }
      cachedStates = sanitizeStoredStates(raw ? JSON.parse(raw) : null);
    } catch {
      cachedStates = {};
    }
    return cachedStates;
  })();

  return loadPromise;
}

async function writeAllCollapseStates(states: CollapseStatesByDocument): Promise<void> {
  try {
    const serialized = JSON.stringify(states);
    if (Platform.OS === 'web') {
      window.localStorage.setItem(STORAGE_KEY, serialized);
      return;
    }

    const FileSystem = await import('expo-file-system/legacy');
    const fileUri = `${FileSystem.documentDirectory}${STORAGE_KEY}.json`;
    await FileSystem.writeAsStringAsync(fileUri, serialized);
  } catch {
    // Best-effort persistence; the current mounted document still remembers.
  }
}

/** Returns explicit user choices only; missing entries fall back to the hymn's database default. */
export async function loadCollapsedSectionStates(documentKey: string): Promise<CollapseStatesBySection> {
  const states = await loadAllCollapseStates();
  return { ...(states[documentKey] || {}) };
}

/** Serializes writes so rapid toggles in different open documents cannot overwrite one another. */
export function saveCollapsedSectionState(documentKey: string, sectionId: string, collapsed: boolean): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    const states = await loadAllCollapseStates();
    states[documentKey] = { ...(states[documentKey] || {}), [sectionId]: collapsed };
    await writeAllCollapseStates(states);
  });
  return writeQueue;
}
