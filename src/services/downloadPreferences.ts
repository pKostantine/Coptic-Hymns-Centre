import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Network from 'expo-network';

export interface DownloadPreferences {
  wifiOnly: boolean;
  allowCellular: boolean;
  allowVideoOnCellular: boolean;
}

const DEFAULTS: DownloadPreferences = {
  wifiOnly: false,
  allowCellular: true,
  allowVideoOnCellular: false,
};
const WEB_KEY = 'chc-download-preferences-v1';
const NATIVE_URI = `${FileSystem.documentDirectory}chc-download-preferences.json`;
let cached: DownloadPreferences | null = null;
const listeners = new Set<() => void>();

function normalize(value: Partial<DownloadPreferences> | null | undefined): DownloadPreferences {
  return {
    wifiOnly: value?.wifiOnly ?? DEFAULTS.wifiOnly,
    allowCellular: value?.allowCellular ?? DEFAULTS.allowCellular,
    allowVideoOnCellular: value?.allowVideoOnCellular ?? DEFAULTS.allowVideoOnCellular,
  };
}

export async function getDownloadPreferences(): Promise<DownloadPreferences> {
  if (cached) return cached;
  try {
    const raw = Platform.OS === 'web'
      ? globalThis.localStorage?.getItem(WEB_KEY) ?? null
      : await FileSystem.readAsStringAsync(NATIVE_URI);
    cached = raw ? normalize(JSON.parse(raw) as Partial<DownloadPreferences>) : { ...DEFAULTS };
  } catch {
    cached = { ...DEFAULTS };
  }
  return cached;
}

export async function setDownloadPreferences(patch: Partial<DownloadPreferences>): Promise<DownloadPreferences> {
  const current = await getDownloadPreferences();
  cached = normalize({ ...current, ...patch });
  const raw = JSON.stringify(cached);
  if (Platform.OS === 'web') globalThis.localStorage?.setItem(WEB_KEY, raw);
  else await FileSystem.writeAsStringAsync(NATIVE_URI, raw);
  listeners.forEach((listener) => listener());
  return cached;
}

export function subscribeDownloadPreferences(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function assertDownloadNetworkAllowed(hasVideo: boolean): Promise<void> {
  const preferences = await getDownloadPreferences();
  const network = await Network.getNetworkStateAsync();
  if (network.isConnected === false || network.type === Network.NetworkStateType.NONE) {
    throw new Error('Connect to the internet to start or update this download.');
  }
  if (network.type !== Network.NetworkStateType.CELLULAR) return;
  if (preferences.wifiOnly || !preferences.allowCellular) {
    throw new Error('Downloads are set to Wi-Fi only.');
  }
  if (hasVideo && !preferences.allowVideoOnCellular) {
    throw new Error('Video downloads over cellular are turned off in Settings.');
  }
}
