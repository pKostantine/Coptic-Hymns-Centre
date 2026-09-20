import { Asset } from 'expo-asset';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

const copticFontModule = require('../../assets/fonts/CopticCHC-Regular-V3.ttf');

let cachedDataUri: string | null = null;

/**
 * Loads the bundled Coptic CHC font and returns it as a base64 data: URI so
 * it can be embedded in a WebView's @font-face — WebView content can't see
 * fonts registered with expo-font in the RN side, and file:// font loading
 * is unreliable across Android/iOS WebView configurations.
 *
 * expo-file-system's readAsStringAsync isn't available on web, so web reads
 * the asset via fetch()+FileReader instead of the native file API.
 */
export function useCopticFontDataUri() {
  const [dataUri, setDataUri] = useState<string | null>(cachedDataUri);

  useEffect(() => {
    if (cachedDataUri) return;
    let cancelled = false;

    (async () => {
      const asset = Asset.fromModule(copticFontModule);
      await asset.downloadAsync();
      if (!asset.localUri) return;

      const uri = Platform.OS === 'web' ? await readAsDataUriWeb(asset.localUri) : await readAsDataUriNative(asset.localUri);
      if (!uri) return;

      cachedDataUri = uri;
      if (!cancelled) setDataUri(uri);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return dataUri;
}

async function readAsDataUriNative(localUri: string) {
  const FileSystem = await import('expo-file-system/legacy');
  const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: 'base64' });
  return `data:font/ttf;base64,${base64}`;
}

async function readAsDataUriWeb(localUri: string) {
  const response = await fetch(localUri);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
