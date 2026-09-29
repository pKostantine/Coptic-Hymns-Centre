import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

/**
 * Puts copied text on the system clipboard — the fallback for when a page's
 * own copy command was refused (that command is what normally writes the rich
 * copy, through the WebView).
 *
 * Android takes the HTML, and derives the plain text from it for apps that take
 * no formatting. iOS gets plain text only: expo-clipboard converts HTML on a
 * background queue, where Apple's HTML importer times out and the module then
 * writes an empty string.
 *
 * Resolves false when this build of the app has no clipboard module, rather
 * than crashing on the import.
 */
export async function writeRichClipboard(text: string, html?: string): Promise<boolean> {
  if (!text || !requireOptionalNativeModule('ExpoClipboard')) return false;
  try {
    const Clipboard = await import('expo-clipboard');
    return html && Platform.OS === 'android'
      ? await Clipboard.setStringAsync(html, { inputFormat: Clipboard.StringFormat.HTML })
      : await Clipboard.setStringAsync(text);
  } catch {
    return false;
  }
}
