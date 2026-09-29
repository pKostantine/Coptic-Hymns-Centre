'use no memo'; // Renders App Language text — see src/utils/appText.ts.
import { Href, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { Children, forwardRef, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NowPlayingAwareScrollView } from '@/components/playback/NowPlayingAwareScroll';
import AppHeader from '../ui/AppHeader';
import BookBand, { BOOK_MENU_MAX_WIDTH } from '../ui/BookBand';
import type { IconName } from '../ui/Icon';
import type { BookTheme } from '../../../constants/bookTheme';
import { COLORS, SPACING, TYPOGRAPHY } from '../../../constants/theme';
import { goBack } from '../../../utils/navigation';

import { appText } from '../../../utils/appText';
interface BookMenuScaffoldProps {
  theme: BookTheme;
  title: { english: string; arabic: string; french?: string };
  overline?: string;
  description?: string;
  /** Set under the band's description (Holy Week's dates). */
  bandChildren?: ReactNode;
  arabic: boolean;
  backHref: Href;
  headerAction?: { icon: IconName; label: string; onPress: () => void };
  children: ReactNode;
}

/**
 * The frame every book's own menu shares: a header in the book's jewel
 * colour running straight into a band with the book's name set large, then
 * the menu's own content — each book fills that content in the shape its
 * services actually have. The name is said once: the header only takes it up
 * when the band has scrolled away.
 */
const BookMenuScaffold = forwardRef<ScrollView, BookMenuScaffoldProps>(function BookMenuScaffold(
  { theme, title, overline, description, bandChildren, arabic, backHref, headerAction, children },
  ref,
) {
  const router = useRouter();
  const bandHeight = useRef(0);
  const [titleVisible, setTitleVisible] = useState(false);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const pastBand = bandHeight.current > 0 && event.nativeEvent.contentOffset.y > bandHeight.current - 44;
    if (pastBand !== titleVisible) setTitleVisible(pastBand);
  };

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
      <Head>
        <title>{`CHC ${title.english}`}</title>
      </Head>
      <AppHeader
        title={title}
        canGoBack
        onBack={() => goBack(router, backHref)}
        visibleLanguages={{ english: !arabic, arabic }}
        tint={theme.gradient[0]}
        titleVisible={titleVisible}
        {...(headerAction ? { rightIcon: headerAction.icon, onRightPress: headerAction.onPress, rightAccessibilityLabel: headerAction.label } : {})}
      />
      <NowPlayingAwareScrollView
        ref={ref}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={32}
      >
        <View onLayout={(event) => { bandHeight.current = event.nativeEvent.layout.height; }}>
          <BookBand theme={theme} title={appText(title)} overline={overline} description={description} arabic={arabic}>
            {bandChildren}
          </BookBand>
        </View>
        <View style={styles.column}>{children}</View>
      </NowPlayingAwareScrollView>
    </SafeAreaView>
  );
});

export default BookMenuScaffold;

/** A small label over a group within a book's menu, drawn out into a hairline rule ("RAISING OF INCENSE ——"). */
export function MenuSectionLabel({ text, arabic, accent }: { text: string; arabic: boolean; accent?: string }) {
  const color = accent ?? COLORS.gold;
  return (
    <View style={[styles.sectionLabel, arabic && styles.rowReverse]}>
      <Text style={[styles.sectionLabelText, { color }, arabic && styles.sectionLabelArabic]} maxFontSizeMultiplier={1.25}>
        {arabic ? text : text.toUpperCase()}
      </Text>
      <View style={[styles.sectionRule, { backgroundColor: color }]} />
    </View>
  );
}

/**
 * Tiles side by side in equal cells, mirrored for Arabic. The cells share
 * the width; a tile grows to its cell's height, so a row's tiles line up
 * whatever each one holds.
 */
export function TileRow({ arabic, children }: { arabic: boolean; children: ReactNode }) {
  return (
    <View style={[styles.tileRow, arabic && styles.rowReverse]}>
      {Children.map(children, (child) => (child ? <View style={styles.tileCell}>{child}</View> : null))}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.black },
  content: { paddingBottom: SPACING.xl * 2 },
  column: { alignSelf: 'center', gap: 12, maxWidth: BOOK_MENU_MAX_WIDTH, paddingHorizontal: SPACING.md, paddingTop: 2, width: '100%' },
  sectionLabel: { alignItems: 'center', flexDirection: 'row', gap: 10, marginHorizontal: 4, marginTop: 12 },
  sectionLabelText: { fontFamily: TYPOGRAPHY.body, fontSize: 11.5, fontWeight: '800', letterSpacing: 1.6, opacity: 0.9 },
  sectionLabelArabic: { fontFamily: TYPOGRAPHY.arabic, fontSize: 13.5, letterSpacing: 0, writingDirection: 'rtl' },
  sectionRule: { flex: 1, height: StyleSheet.hairlineWidth, opacity: 0.35 },
  tileRow: { flexDirection: 'row', gap: 10 },
  tileCell: { flex: 1, minWidth: 0 },
  rowReverse: { flexDirection: 'row-reverse' },
});
