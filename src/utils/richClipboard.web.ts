/**
 * Puts copied text on the browser clipboard: the rich HTML alongside the plain
 * text, so an editor keeps the formatting and a search box gets plain words.
 * Browsers without ClipboardItem get the plain text only.
 */
export async function writeRichClipboard(text: string, html?: string): Promise<boolean> {
  const clipboard = globalThis.navigator?.clipboard;
  if (!text || !clipboard) return false;
  try {
    if (html && typeof ClipboardItem !== 'undefined' && clipboard.write) {
      await clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([text], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' }),
        }),
      ]);
    } else {
      await clipboard.writeText(text);
    }
    return true;
  } catch {
    return false;
  }
}
