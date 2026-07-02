import { useMemo } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { COLORS } from '../../constants/theme';
import { useCopticFontDataUri } from '../../utils/useCopticFontDataUri';
import { buildDocumentHtml, DocumentSection } from './documentHtml';

export type { DocumentSection, DocumentVerse } from './documentHtml';

/**
 * Web document renderer. react-native-webview doesn't support the web
 * platform, so this uses a plain iframe with the same HTML builder as the
 * native renderer (DocumentWebView.tsx) — Metro resolves this file
 * automatically for web builds via the .web.tsx extension.
 */
export default function DocumentWebView({ sections, fontSize = 18 }: { sections: DocumentSection[]; fontSize?: number }) {
  const copticFontDataUri = useCopticFontDataUri();

  const html = useMemo(
    () => (copticFontDataUri ? buildDocumentHtml(sections, { copticFontDataUri, fontSize }) : null),
    [sections, copticFontDataUri, fontSize],
  );

  if (!html) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.black }}>
        <ActivityIndicator color={COLORS.gold} />
      </View>
    );
  }

  return (
    <iframe
      srcDoc={html}
      style={{ flex: 1, width: '100%', height: '100%', border: 'none', backgroundColor: COLORS.black }}
      sandbox="allow-same-origin"
    />
  );
}
