import { Alert, Platform, Share } from 'react-native';

interface ShareLinkOptions {
  title: string;
  text?: string | null;
  url: string;
}

type WebShareNavigator = {
  share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
  clipboard?: { writeText?: (value: string) => Promise<void> };
};

function isAbortError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'name' in error && (error as { name?: string }).name === 'AbortError');
}

/**
 * Uses the device/browser share sheet when one exists. Browsers without the
 * Web Share API fall back to copying the deep link, then finally to a simple
 * copy dialog when clipboard access is unavailable.
 */
export async function shareLink({ title, text, url }: ShareLinkOptions): Promise<'shared' | 'copied' | 'cancelled'> {
  const message = [text?.trim(), url].filter(Boolean).join('\n');

  if (Platform.OS !== 'web') {
    try {
      await Share.share(
        Platform.OS === 'ios'
          ? { title, message: text?.trim() || title, url }
          : { title, message },
      );
      return 'shared';
    } catch (error) {
      if (isAbortError(error)) return 'cancelled';
      Alert.alert(title, url);
      return 'copied';
    }
  }

  const globalObject = globalThis as typeof globalThis & {
    navigator?: WebShareNavigator;
    prompt?: (message?: string, defaultValue?: string) => string | null;
  };
  const navigator = globalObject.navigator;

  if (navigator?.share) {
    try {
      await navigator.share({ title, text: text?.trim() || undefined, url });
      return 'shared';
    } catch (error) {
      if (isAbortError(error)) return 'cancelled';
    }
  }

  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      Alert.alert('Link copied', 'The share link was copied to your clipboard.');
      return 'copied';
    } catch {
      // Fall through to the explicit copy dialog.
    }
  }

  globalObject.prompt?.('Copy this link', url);
  return 'copied';
}
